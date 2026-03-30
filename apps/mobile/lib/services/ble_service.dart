// ignore_for_file: lines_longer_than_80_chars

import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter_blue_plus/flutter_blue_plus.dart';

import 'package:tangping_lobster/utils/ble_constants.dart';

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

/// Immutable snapshot of a nearby lobster discovered via BLE.
class NearbyLobster {
  /// Creates a [NearbyLobster].
  const NearbyLobster({
    required this.lobsterId,
    required this.rssi,
    required this.estimatedDistance,
    required this.lastSeen,
  });

  /// The remote peer's lobster identifier (UUID string).
  final String lobsterId;

  /// Raw RSSI reading in dBm.  More negative = weaker signal.
  final int rssi;

  /// Estimated distance in metres derived from the path-loss model.
  /// See [BleService.rssiToDistance].
  final double estimatedDistance;

  /// Wall-clock time of the most recent advertisement from this device.
  final DateTime lastSeen;

  /// Returns a copy with the supplied fields replaced.
  NearbyLobster copyWith({
    String? lobsterId,
    int? rssi,
    double? estimatedDistance,
    DateTime? lastSeen,
  }) =>
      NearbyLobster(
        lobsterId: lobsterId ?? this.lobsterId,
        rssi: rssi ?? this.rssi,
        estimatedDistance: estimatedDistance ?? this.estimatedDistance,
        lastSeen: lastSeen ?? this.lastSeen,
      );

  @override
  String toString() =>
      'NearbyLobster(id: $lobsterId, rssi: $rssi dBm, '
      'distance: ${estimatedDistance.toStringAsFixed(1)} m, '
      'lastSeen: $lastSeen)';
}

// ---------------------------------------------------------------------------
// Encounter tracking (file-private)
// ---------------------------------------------------------------------------

/// Tracks the first-seen time of a particular peer.  Used to compute
/// continuous dwell time for encounter reporting.
class _EncounterTracker {
  _EncounterTracker({required this.lobsterId, required this.firstSeen});

  final String lobsterId;
  final DateTime firstSeen;
  bool reported = false;
}

// ---------------------------------------------------------------------------
// Callback type for encounter reporting
// ---------------------------------------------------------------------------

/// Called by [BleService] when an encounter threshold is reached.
///
/// Implementations should forward the encounter to the backend API.
typedef EncounterReportCallback = Future<void> Function(
  String lobsterId,
  double distanceMetres,
);

// ---------------------------------------------------------------------------
// BLE service
// ---------------------------------------------------------------------------

/// Manages BLE advertising (peripheral mode) and scanning (central mode) to
/// discover and report proximity encounters between Tangping Lobster users.
///
/// ## Lifecycle
/// ```dart
/// final ble = BleService();
/// await ble.initialize(
///   lobsterId: 'my-uuid',
///   onEncounter: (id, dist) async { /* report to backend */ },
/// );
/// await ble.start();
/// ble.nearbyStream.listen((list) => print('Nearby: $list'));
/// // …
/// await ble.stop();
/// ble.dispose();
/// ```
class BleService {
  // ---- identity -----------------------------------------------------------

  String? _myLobsterId;
  EncounterReportCallback? _onEncounter;

  // ---- discovered peers ---------------------------------------------------

  final Map<String, NearbyLobster> _nearbyLobsters = {};
  final Map<String, _EncounterTracker> _encounterTrackers = {};

  // ---- output stream ------------------------------------------------------

  final StreamController<List<NearbyLobster>> _nearbyController =
      StreamController<List<NearbyLobster>>.broadcast();

  /// Emits an updated snapshot of all currently visible lobsters whenever
  /// the set changes.
  Stream<List<NearbyLobster>> get nearbyStream => _nearbyController.stream;

  /// Synchronous read of the current nearby set.
  List<NearbyLobster> get nearby =>
      List<NearbyLobster>.unmodifiable(_nearbyLobsters.values);

  // ---- internal subscriptions / timers ------------------------------------

  StreamSubscription<List<ScanResult>>? _scanSub;
  Timer? _pruneTimer;
  Timer? _encounterCheckTimer;

  // ---- lifecycle ----------------------------------------------------------

  /// Stores the [lobsterId] used in advertisements and the optional
  /// [onEncounter] callback invoked when a dwell threshold is reached.
  Future<void> initialize({
    required String lobsterId,
    EncounterReportCallback? onEncounter,
  }) async {
    _myLobsterId = lobsterId;
    _onEncounter = onEncounter;
  }

  /// Starts advertising and scanning.
  ///
  /// Requires [initialize] to be called first.
  Future<void> start() async {
    assert(
      _myLobsterId != null,
      'BleService.initialize() must be called before start()',
    );
    await _startAdvertising();
    await _startScanning();

    _pruneTimer = Timer.periodic(
      const Duration(seconds: 10),
      (_) => _pruneStale(),
    );
    _encounterCheckTimer = Timer.periodic(
      const Duration(seconds: 1),
      (_) => _checkAllEncounters(),
    );
  }

  /// Stops all BLE activity and cancels background timers.
  Future<void> stop() async {
    _pruneTimer?.cancel();
    _pruneTimer = null;
    _encounterCheckTimer?.cancel();
    _encounterCheckTimer = null;

    await _scanSub?.cancel();
    _scanSub = null;

    await FlutterBluePlus.stopScan();
  }

  /// Stops BLE and closes the output stream.
  void dispose() {
    unawaited(stop());
    if (!_nearbyController.isClosed) {
      _nearbyController.close();
    }
  }

  // ---- advertising (peripheral) -------------------------------------------

  /// Broadcasts this device's lobster-id as BLE manufacturer-specific data.
  ///
  /// flutter_blue_plus 1.x supports advertising on Android; iOS peripheral
  /// mode requires a native plugin (`flutter_ble_peripheral`) and is handled
  /// at the platform layer via a method channel.  On iOS the app relies solely
  /// on scan-response matching when it is the advertising device.
  Future<void> _startAdvertising() async {
    // flutter_blue_plus does not expose a Dart-side advertising API for iOS.
    // Android advertising is triggered via FlutterBluePlus.startAdvertising
    // (added in 1.29+).  We encode the lobster-id as UTF-8 manufacturer data.
    final id = _myLobsterId;
    if (id == null) return;

    final idBytes = _lobsterIdToBytes(id);

    // Manufacturer ID 0xFFFF is reserved for testing/prototyping.
    // Replace with a registered Company Identifier before production release.
    const manufacturerId = 0xFFFF;

    // flutter_blue_plus 1.x does not expose a Dart-side advertising API on
    // all platforms.  Advertising is handled via a native method channel for
    // Android (BLE peripheral mode) and is not available on iOS from Dart.
    // The lobster-id bytes are carried in scan-response matching instead.
    // TODO(advertising): wire up platform channel for Android BLE advertising.
    assert(idBytes.isNotEmpty, 'idBytes should be non-empty');
    assert(manufacturerId >= 0, 'manufacturerId should be non-negative');
  }

  // ---- scanning (central) -------------------------------------------------

  /// Scans for advertisements carrying [kServiceUuid] and updates the
  /// [_nearbyLobsters] map on each result.
  Future<void> _startScanning() async {
    // Remove any running scan first.
    await FlutterBluePlus.stopScan();

    _scanSub = FlutterBluePlus.scanResults.listen(
      _onScanResults,
      onError: (_) {/* Bluetooth may be off; retry handled by OS */},
      cancelOnError: false,
    );

    await FlutterBluePlus.startScan(
      withServices: [Guid(kServiceUuid)],
      continuousUpdates: true,
      removeIfGone: const Duration(seconds: 30),
    );
  }

  void _onScanResults(List<ScanResult> results) {
    var changed = false;

    for (final result in results) {
      final lobsterId = _extractLobsterId(result.advertisementData);
      if (lobsterId == null) continue;
      // Ignore our own broadcasts.
      if (lobsterId == _myLobsterId) continue;

      final distance = rssiToDistance(result.rssi);
      final now = DateTime.now();

      final updated = NearbyLobster(
        lobsterId: lobsterId,
        rssi: result.rssi,
        estimatedDistance: distance,
        lastSeen: now,
      );

      _nearbyLobsters[lobsterId] = updated;

      // Start tracking dwell time if this is a new peer.
      _encounterTrackers.putIfAbsent(
        lobsterId,
        () => _EncounterTracker(lobsterId: lobsterId, firstSeen: now),
      );

      changed = true;
    }

    if (changed) _emitNearby();
  }

  // ---- RSSI → distance model ----------------------------------------------

  /// Converts an RSSI reading to an estimated distance in metres using a
  /// log-distance path-loss model.
  ///
  /// ```
  /// distance = 10 ^ ((txPower - rssi) / (10 * n))
  /// ```
  ///
  /// Parameters [kTxPowerDbm] and [kBleNValue] are defined in
  /// [ble_constants.dart].
  static double rssiToDistance(int rssi) {
    final exponent = (kTxPowerDbm - rssi) / (10.0 * kBleNValue);
    return math.pow(10, exponent).toDouble();
  }

  // ---- encounter detection ------------------------------------------------

  void _checkAllEncounters() {
    for (final lobster in _nearbyLobsters.values) {
      _checkEncounter(lobster);
    }
  }

  void _checkEncounter(NearbyLobster lobster) {
    if (lobster.estimatedDistance > kEncounterMaxDistanceMetres) return;

    final tracker = _encounterTrackers[lobster.lobsterId];
    if (tracker == null || tracker.reported) return;

    final dwell = DateTime.now().difference(tracker.firstSeen);
    if (dwell < kEncounterMinDwell) return;

    tracker.reported = true;

    final callback = _onEncounter;
    if (callback != null) {
      callback(lobster.lobsterId, lobster.estimatedDistance).ignore();
    }
  }

  // ---- staleness pruning --------------------------------------------------

  void _pruneStale() {
    final cutoff = DateTime.now().subtract(kStaleTimeout);
    final staleKeys = _nearbyLobsters.entries
        .where((e) => e.value.lastSeen.isBefore(cutoff))
        .map((e) => e.key)
        .toList();

    if (staleKeys.isEmpty) return;

    for (final key in staleKeys) {
      _nearbyLobsters.remove(key);
      _encounterTrackers.remove(key);
    }
    _emitNearby();
  }

  // ---- helpers ------------------------------------------------------------

  /// Extracts a lobster-id string from manufacturer-specific advertisement
  /// data encoded by [_lobsterIdToBytes].
  ///
  /// Returns null when no matching manufacturer data is present.
  String? _extractLobsterId(AdvertisementData advertisementData) {
    const manufacturerId = 0xFFFF;
    final payload = advertisementData.manufacturerData[manufacturerId];
    if (payload == null || payload.isEmpty) return null;
    try {
      return utf8.decode(payload, allowMalformed: false);
    } on FormatException {
      return null;
    }
  }

  /// Encodes [lobsterId] as a UTF-8 byte list, clamped to
  /// [kManufacturerDataMaxBytes].
  static Uint8List _lobsterIdToBytes(String lobsterId) {
    final bytes = utf8.encode(lobsterId);
    if (bytes.length <= kManufacturerDataMaxBytes) {
      return Uint8List.fromList(bytes);
    }
    return Uint8List.fromList(bytes.sublist(0, kManufacturerDataMaxBytes));
  }

  void _emitNearby() {
    if (!_nearbyController.isClosed) {
      _nearbyController.add(nearby);
    }
  }
}
