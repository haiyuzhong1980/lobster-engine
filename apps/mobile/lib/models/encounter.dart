import 'package:freezed_annotation/freezed_annotation.dart';

part 'encounter.freezed.dart';
part 'encounter.g.dart';

/// How two lobsters detected each other.
enum EncounterMethod {
  /// Bluetooth Low Energy proximity.
  bluetooth,

  /// GPS / geohash proximity.
  gps,

  /// Wi-Fi SSID matching.
  wifi,

  /// QR-code scan.
  qr,

  /// Manual / user-initiated pairing.
  manual,
}

/// A single encounter event between two lobsters.
@freezed
class EncounterRecord with _$EncounterRecord {
  const factory EncounterRecord({
    /// Unique encounter ID.
    required String id,

    /// The lobster that reported this encounter.
    required String reporterId,

    /// The other lobster met during this encounter.
    required String peerId,

    /// Display name of the peer lobster (denormalised for display).
    String? peerName,

    /// Avatar URL of the peer lobster (denormalised for display).
    String? peerAvatarUrl,

    /// Detection mechanism used.
    required EncounterMethod method,

    /// Bluetooth RSSI signal strength (only for BLE encounters).
    int? rssi,

    /// GeoHash of the encounter location (only for GPS encounters).
    String? geoHash,

    /// Relationship impact: positive, negative, neutral.
    @Default('neutral') String relationImpact,

    /// ISO-8601 timestamp when this encounter occurred.
    required String encounteredAt,
  }) = _EncounterRecord;

  factory EncounterRecord.fromJson(Map<String, Object?> json) =>
      _$EncounterRecordFromJson(json);
}

/// The result returned by the /encounter/report endpoint.
@freezed
class EncounterReportResult with _$EncounterReportResult {
  const factory EncounterReportResult({
    /// Whether the encounter was successfully recorded.
    required bool success,

    /// The created encounter record (null if duplicate / failed).
    EncounterRecord? encounter,

    /// Informational message from the server.
    String? message,
  }) = _EncounterReportResult;

  factory EncounterReportResult.fromJson(Map<String, Object?> json) =>
      _$EncounterReportResultFromJson(json);
}
