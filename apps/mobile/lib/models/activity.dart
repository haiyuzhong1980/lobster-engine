import 'package:freezed_annotation/freezed_annotation.dart';

part 'activity.freezed.dart';
part 'activity.g.dart';

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
@freezed
class ActivityReport with _$ActivityReport {
  const factory ActivityReport({
    /// The lobster reporting this activity.
    required String lobsterId,

    /// Detected sensor activity type.
    required SensorActivityType type,

    /// ML model confidence score (0.0–1.0).
    required double confidence,

    /// Optional raw sensor metadata.
    @Default({}) Map<String, Object> metadata,

    /// ISO-8601 timestamp of detection.
    required String detectedAt,
  }) = _ActivityReport;

  factory ActivityReport.fromJson(Map<String, Object?> json) =>
      _$ActivityReportFromJson(json);
}

/// Response returned after reporting an activity.
@freezed
class ActivityResponse with _$ActivityResponse {
  const factory ActivityResponse({
    /// Whether the activity was accepted.
    required bool accepted,

    /// Current sensor activity recorded on the server.
    required SensorActivityType currentActivity,

    /// XP rewarded for this activity detection (0 if already known).
    @Default(0) int xpGranted,

    /// Informational message.
    String? message,
  }) = _ActivityResponse;

  factory ActivityResponse.fromJson(Map<String, Object?> json) =>
      _$ActivityResponseFromJson(json);
}

/// Client-side sensor state used to drive activity detection.
///
/// Note: the in-game [ActivityState] used by scene rendering lives in
/// `activity_state.dart`. This class holds raw sensor telemetry only.
@freezed
class SensorState with _$SensorState {
  const factory SensorState({
    /// Current recognised sensor activity.
    @Default(SensorActivityType.unknown) SensorActivityType current,

    /// Confidence in the current recognition.
    @Default(0.0) double confidence,

    /// Live accelerometer magnitude (m/s²).
    @Default(0.0) double accelerometerMagnitude,

    /// Step count since midnight (if available).
    int? stepCount,

    /// ISO-8601 timestamp of last sensor update.
    String? lastUpdatedAt,
  }) = _SensorState;

  factory SensorState.fromJson(Map<String, Object?> json) =>
      _$SensorStateFromJson(json);
}
