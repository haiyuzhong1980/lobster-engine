import 'dart:async';

import 'package:hive_flutter/hive_flutter.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import 'package:tangping_lobster/models/encounter.dart';
import 'package:tangping_lobster/providers/api_providers.dart';
import 'package:tangping_lobster/services/ws_service.dart';

part 'encounter_provider.g.dart';

const _hiveBoxName = 'encounters';
const _hiveKeyPrefix = 'encounters_';

/// Manages encounter history for a lobster and exposes reporting functionality.
///
/// - Fetches encounter history from the API on first build.
/// - Caches the list in Hive for offline browsing.
/// - Auto-prepends new encounters when [WsEncounterEvent] arrives.
@riverpod
class EncounterNotifier extends _$EncounterNotifier {
  late final Box<List<dynamic>> _box;
  StreamSubscription<WsEvent>? _wsSub;

  @override
  Future<List<EncounterRecord>> build(String lobsterId) async {
    _box = await Hive.openBox<List<dynamic>>(_hiveBoxName);

    final ws = ref.watch(webSocketServiceProvider);
    _wsSub = ws.events.listen(_handleWsEvent);
    ref.onDispose(() => _wsSub?.cancel());

    return _fetchAndCache(lobsterId);
  }

  // -------------------------------------------------------------------------
  // Public mutations
  // -------------------------------------------------------------------------

  /// Report a new encounter and prepend it to the local list.
  Future<EncounterReportResult> reportEncounter({
    required String peerId,
    required EncounterMethod method,
    int? rssi,
    String? geoHash,
  }) async {
    final api = ref.read(apiServiceProvider);
    final result = await api.reportEncounter(
      lobsterId,
      peerId,
      method.name,
      rssi: rssi,
      geoHash: geoHash,
    );
    if (result.success && result.encounter != null) {
      final current = state.valueOrNull ?? [];
      final updated = [result.encounter!, ...current];
      state = AsyncData(updated);
      await _cacheList(updated);
    }
    return result;
  }

  /// Re-fetch full encounter history from the server.
  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => _fetchAndCache(lobsterId));
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  Future<List<EncounterRecord>> _fetchAndCache(String id) async {
    try {
      final api = ref.read(apiServiceProvider);
      final fresh = await api.getEncounterHistory(id);
      await _cacheList(fresh);
      return fresh;
    } catch (_) {
      final cached = _readCache(id);
      if (cached != null) return cached;
      rethrow;
    }
  }

  Future<void> _cacheList(List<EncounterRecord> records) async {
    final serialised = records.map((r) => r.toJson()).toList();
    await _box.put('$_hiveKeyPrefix$lobsterId', serialised);
  }

  List<EncounterRecord>? _readCache(String id) {
    final raw = _box.get('$_hiveKeyPrefix$id');
    if (raw == null) return null;
    try {
      return raw
          .whereType<Map<dynamic, dynamic>>()
          .map((m) => EncounterRecord.fromJson(Map<String, Object?>.from(m)))
          .toList();
    } catch (_) {
      return null;
    }
  }

  void _handleWsEvent(WsEvent event) {
    if (event is! WsEncounterEvent) return;

    // The WebSocket payload may contain a partial or full EncounterRecord.
    try {
      final record = EncounterRecord.fromJson(event.payload);
      // Only prepend if this encounter involves our lobster.
      if (record.reporterId != lobsterId && record.peerId != lobsterId) return;

      final current = state.valueOrNull ?? [];
      // Avoid duplicates.
      if (current.any((e) => e.id == record.id)) return;

      final updated = [record, ...current];
      state = AsyncData(updated);
      _cacheList(updated);
    } catch (_) {
      // Malformed payload — ignore.
    }
  }
}
