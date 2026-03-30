/// Physical motion types that the device sensor layer can classify.
///
/// Distinct from [ActivityType] in `activity_state.dart` which models
/// in-game lobster activities. This enum represents real-world motion.
enum SensorActivityType {
  /// Completely still — the ideal tangping state.
  stationary,

  /// Gentle walking.
  walking,

  /// Brisk walking or jogging.
  running,

  /// Riding a bicycle or scooter.
  cycling,

  /// Motorised transport (car, bus, train).
  transit,

  /// Indoor activity detected by accelerometer patterns.
  indoorActive,

  /// Resting / asleep.
  resting,

  /// Activity type could not be determined.
  unknown,
}

/// A single activity recognition report sent to the server.
class ActivityReport {
  const ActivityReport({
    required this.lobsterId,
    required this.type,
    required this.confidence,
    this.metadata = const {},
    required this.detectedAt,
  });

  /// The lobster reporting this activity.
  final String lobsterId;

  /// Detected sensor activity type.
  final SensorActivityType type;

  /// ML model confidence score (0.0–1.0).
  final double confidence;

  /// Optional raw sensor metadata.
  final Map<String, Object> metadata;

  /// ISO-8601 timestamp of detection.
  final String detectedAt;

  ActivityReport copyWith({
    String? lobsterId,
    SensorActivityType? type,
    double? confidence,
    Map<String, Object>? metadata,
    String? detectedAt,
  }) {
    return ActivityReport(
      lobsterId: lobsterId ?? this.lobsterId,
      type: type ?? this.type,
      confidence: confidence ?? this.confidence,
      metadata: metadata ?? this.metadata,
      detectedAt: detectedAt ?? this.detectedAt,
    );
  }

  factory ActivityReport.fromJson(Map<String, Object?> json) {
    return ActivityReport(
      lobsterId: json['lobsterId'] as String? ?? '',
      type: _sensorActivityTypeFromJson(json['type'] as String?),
      confidence: (json['confidence'] as num?)?.toDouble() ?? 0.0,
      metadata: (json['metadata'] as Map?)?.cast<String, Object>() ?? const {},
      detectedAt: json['detectedAt'] as String? ?? '',
    );
  }

  Map<String, Object?> toJson() {
    return {
      'lobsterId': lobsterId,
      'type': type.name,
      'confidence': confidence,
      if (metadata.isNotEmpty) 'metadata': metadata,
      'detectedAt': detectedAt,
    };
  }

  @override
  bool operator ==(Object other) {
    return other is ActivityReport &&
        other.lobsterId == lobsterId &&
        other.type == type &&
        other.detectedAt == detectedAt;
  }

  @override
  int get hashCode => Object.hash(lobsterId, type, detectedAt);
}

/// Response returned after reporting an activity.
class ActivityResponse {
  const ActivityResponse({
    required this.accepted,
    required this.currentActivity,
    this.xpGranted = 0,
    this.message,
  });

  /// Whether the activity was accepted.
  final bool accepted;

  /// Current sensor activity recorded on the server.
  final SensorActivityType currentActivity;

  /// XP rewarded for this activity detection (0 if already known).
  final int xpGranted;

  /// Informational message.
  final String? message;

  ActivityResponse copyWith({
    bool? accepted,
    SensorActivityType? currentActivity,
    int? xpGranted,
    String? message,
  }) {
    return ActivityResponse(
      accepted: accepted ?? this.accepted,
      currentActivity: currentActivity ?? this.currentActivity,
      xpGranted: xpGranted ?? this.xpGranted,
      message: message ?? this.message,
    );
  }

  factory ActivityResponse.fromJson(Map<String, Object?> json) {
    return ActivityResponse(
      accepted: json['accepted'] as bool? ?? false,
      currentActivity:
          _sensorActivityTypeFromJson(json['currentActivity'] as String?),
      xpGranted: (json['xpGranted'] as num?)?.toInt() ?? 0,
      message: json['message'] as String?,
    );
  }

  Map<String, Object?> toJson() {
    return {
      'accepted': accepted,
      'currentActivity': currentActivity.name,
      if (xpGranted != 0) 'xpGranted': xpGranted,
      if (message != null) 'message': message,
    };
  }

  @override
  bool operator ==(Object other) {
    return other is ActivityResponse &&
        other.accepted == accepted &&
        other.currentActivity == currentActivity &&
        other.xpGranted == xpGranted &&
        other.message == message;
  }

  @override
  int get hashCode =>
      Object.hash(accepted, currentActivity, xpGranted, message);
}

/// Client-side sensor state used to drive activity detection.
///
/// Note: the in-game [ActivityState] used by scene rendering lives in
/// `activity_state.dart`. This class holds raw sensor telemetry only.
class SensorState {
  const SensorState({
    this.current = SensorActivityType.unknown,
    this.confidence = 0.0,
    this.accelerometerMagnitude = 0.0,
    this.stepCount,
    this.lastUpdatedAt,
  });

  /// Current recognised sensor activity.
  final SensorActivityType current;

  /// Confidence in the current recognition.
  final double confidence;

  /// Live accelerometer magnitude (m/s²).
  final double accelerometerMagnitude;

  /// Step count since midnight (if available).
  final int? stepCount;

  /// ISO-8601 timestamp of last sensor update.
  final String? lastUpdatedAt;

  SensorState copyWith({
    SensorActivityType? current,
    double? confidence,
    double? accelerometerMagnitude,
    int? stepCount,
    String? lastUpdatedAt,
  }) {
    return SensorState(
      current: current ?? this.current,
      confidence: confidence ?? this.confidence,
      accelerometerMagnitude:
          accelerometerMagnitude ?? this.accelerometerMagnitude,
      stepCount: stepCount ?? this.stepCount,
      lastUpdatedAt: lastUpdatedAt ?? this.lastUpdatedAt,
    );
  }

  factory SensorState.fromJson(Map<String, Object?> json) {
    return SensorState(
      current: _sensorActivityTypeFromJson(json['current'] as String?),
      confidence: (json['confidence'] as num?)?.toDouble() ?? 0.0,
      accelerometerMagnitude:
          (json['accelerometerMagnitude'] as num?)?.toDouble() ?? 0.0,
      stepCount: (json['stepCount'] as num?)?.toInt(),
      lastUpdatedAt: json['lastUpdatedAt'] as String?,
    );
  }

  Map<String, Object?> toJson() {
    return {
      if (current != SensorActivityType.unknown) 'current': current.name,
      if (confidence != 0.0) 'confidence': confidence,
      if (accelerometerMagnitude != 0.0)
        'accelerometerMagnitude': accelerometerMagnitude,
      if (stepCount != null) 'stepCount': stepCount,
      if (lastUpdatedAt != null) 'lastUpdatedAt': lastUpdatedAt,
    };
  }

  @override
  bool operator ==(Object other) {
    return other is SensorState &&
        other.current == current &&
        other.confidence == confidence &&
        other.accelerometerMagnitude == accelerometerMagnitude &&
        other.stepCount == stepCount &&
        other.lastUpdatedAt == lastUpdatedAt;
  }

  @override
  int get hashCode => Object.hash(
        current,
        confidence,
        accelerometerMagnitude,
        stepCount,
        lastUpdatedAt,
      );
}

SensorActivityType _sensorActivityTypeFromJson(String? value) {
  switch (value) {
    case 'stationary':
      return SensorActivityType.stationary;
    case 'walking':
      return SensorActivityType.walking;
    case 'running':
      return SensorActivityType.running;
    case 'cycling':
      return SensorActivityType.cycling;
    case 'transit':
      return SensorActivityType.transit;
    case 'indoorActive':
      return SensorActivityType.indoorActive;
    case 'resting':
      return SensorActivityType.resting;
    default:
      return SensorActivityType.unknown;
  }
}
