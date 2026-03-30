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
class EncounterRecord {
  const EncounterRecord({
    required this.id,
    required this.reporterId,
    required this.peerId,
    this.peerName,
    this.peerAvatarUrl,
    required this.method,
    this.rssi,
    this.geoHash,
    this.relationImpact = 'neutral',
    required this.encounteredAt,
  });

  /// Unique encounter ID.
  final String id;

  /// The lobster that reported this encounter.
  final String reporterId;

  /// The other lobster met during this encounter.
  final String peerId;

  /// Display name of the peer lobster (denormalised for display).
  final String? peerName;

  /// Avatar URL of the peer lobster (denormalised for display).
  final String? peerAvatarUrl;

  /// Detection mechanism used.
  final EncounterMethod method;

  /// Bluetooth RSSI signal strength (only for BLE encounters).
  final int? rssi;

  /// GeoHash of the encounter location (only for GPS encounters).
  final String? geoHash;

  /// Relationship impact: positive, negative, neutral.
  final String relationImpact;

  /// ISO-8601 timestamp when this encounter occurred.
  final String encounteredAt;

  EncounterRecord copyWith({
    String? id,
    String? reporterId,
    String? peerId,
    String? peerName,
    String? peerAvatarUrl,
    EncounterMethod? method,
    int? rssi,
    String? geoHash,
    String? relationImpact,
    String? encounteredAt,
  }) {
    return EncounterRecord(
      id: id ?? this.id,
      reporterId: reporterId ?? this.reporterId,
      peerId: peerId ?? this.peerId,
      peerName: peerName ?? this.peerName,
      peerAvatarUrl: peerAvatarUrl ?? this.peerAvatarUrl,
      method: method ?? this.method,
      rssi: rssi ?? this.rssi,
      geoHash: geoHash ?? this.geoHash,
      relationImpact: relationImpact ?? this.relationImpact,
      encounteredAt: encounteredAt ?? this.encounteredAt,
    );
  }

  factory EncounterRecord.fromJson(Map<String, Object?> json) {
    return EncounterRecord(
      id: json['id'] as String? ?? '',
      reporterId: json['reporterId'] as String? ?? '',
      peerId: json['peerId'] as String? ?? '',
      peerName: json['peerName'] as String?,
      peerAvatarUrl: json['peerAvatarUrl'] as String?,
      method: _encounterMethodFromJson(json['method'] as String?),
      rssi: (json['rssi'] as num?)?.toInt(),
      geoHash: json['geoHash'] as String?,
      relationImpact: json['relationImpact'] as String? ?? 'neutral',
      encounteredAt: json['encounteredAt'] as String? ?? '',
    );
  }

  Map<String, Object?> toJson() {
    return {
      'id': id,
      'reporterId': reporterId,
      'peerId': peerId,
      if (peerName != null) 'peerName': peerName,
      if (peerAvatarUrl != null) 'peerAvatarUrl': peerAvatarUrl,
      'method': method.name,
      if (rssi != null) 'rssi': rssi,
      if (geoHash != null) 'geoHash': geoHash,
      'relationImpact': relationImpact,
      'encounteredAt': encounteredAt,
    };
  }

  @override
  bool operator ==(Object other) {
    return other is EncounterRecord && other.id == id;
  }

  @override
  int get hashCode => id.hashCode;
}

/// The result returned by the /encounter/report endpoint.
class EncounterReportResult {
  const EncounterReportResult({
    required this.success,
    this.encounter,
    this.message,
  });

  /// Whether the encounter was successfully recorded.
  final bool success;

  /// The created encounter record (null if duplicate / failed).
  final EncounterRecord? encounter;

  /// Informational message from the server.
  final String? message;

  factory EncounterReportResult.fromJson(Map<String, Object?> json) {
    final encounterJson = json['encounter'];
    return EncounterReportResult(
      success: json['success'] as bool? ?? false,
      encounter: encounterJson is Map
          ? EncounterRecord.fromJson(encounterJson.cast<String, Object?>())
          : null,
      message: json['message'] as String?,
    );
  }

  Map<String, Object?> toJson() {
    return {
      'success': success,
      if (encounter != null) 'encounter': encounter!.toJson(),
      if (message != null) 'message': message,
    };
  }
}

EncounterMethod _encounterMethodFromJson(String? value) {
  switch (value) {
    case 'bluetooth':
      return EncounterMethod.bluetooth;
    case 'gps':
      return EncounterMethod.gps;
    case 'wifi':
      return EncounterMethod.wifi;
    case 'qr':
      return EncounterMethod.qr;
    default:
      return EncounterMethod.manual;
  }
}
