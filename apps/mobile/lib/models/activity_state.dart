import 'package:freezed_annotation/freezed_annotation.dart';

part 'activity_state.freezed.dart';
part 'activity_state.g.dart';

/// Types of activities the lobster may be engaged in.
enum ActivityType {
  @JsonValue('lying_flat')
  lyingFlat,
  @JsonValue('snacking')
  snacking,
  @JsonValue('napping')
  napping,
  @JsonValue('strolling')
  strolling,
  @JsonValue('bubble_watching')
  bubbleWatching,
  @JsonValue('deep_thinking')
  deepThinking,
  @JsonValue('socializing')
  socializing,
  @JsonValue('collecting_shells')
  collectingShells,
  @JsonValue('stargazing')
  stargazing,
  @JsonValue('cloud_counting')
  cloudCounting,
}

extension ActivityTypeDisplay on ActivityType {
  String get label => switch (this) {
        ActivityType.lyingFlat => '躺平中',
        ActivityType.snacking => '觅食中',
        ActivityType.napping => '午睡中',
        ActivityType.strolling => '散步中',
        ActivityType.bubbleWatching => '看泡泡',
        ActivityType.deepThinking => '深度思考',
        ActivityType.socializing => '社交中',
        ActivityType.collectingShells => '捡贝壳',
        ActivityType.stargazing => '看星星',
        ActivityType.cloudCounting => '数云朵',
      };

  String get emoji => switch (this) {
        ActivityType.lyingFlat => '🛋️',
        ActivityType.snacking => '🍤',
        ActivityType.napping => '💤',
        ActivityType.strolling => '🚶',
        ActivityType.bubbleWatching => '🫧',
        ActivityType.deepThinking => '💭',
        ActivityType.socializing => '🤝',
        ActivityType.collectingShells => '🐚',
        ActivityType.stargazing => '⭐',
        ActivityType.cloudCounting => '☁️',
      };
}

/// The active scene/environment a lobster inhabits.
enum SceneType {
  @JsonValue('ocean_floor')
  oceanFloor,
  @JsonValue('coral_reef')
  coralReef,
  @JsonValue('sandy_beach')
  sandyBeach,
  @JsonValue('kelp_forest')
  kelpForest,
  @JsonValue('deep_sea')
  deepSea,
  @JsonValue('tide_pool')
  tidePool,
}

extension SceneTypeDisplay on SceneType {
  String get label => switch (this) {
        SceneType.oceanFloor => '海底',
        SceneType.coralReef => '珊瑚礁',
        SceneType.sandyBeach => '沙滩',
        SceneType.kelpForest => '海藻林',
        SceneType.deepSea => '深海',
        SceneType.tidePool => '潮水池',
      };
}

/// What the lobster is currently doing and where.
@freezed
class ActivityState with _$ActivityState {
  const factory ActivityState({
    required ActivityType activity,
    required SceneType scene,

    /// Lying-flat index 1–5 (how deeply the lobster is tangping).
    @Default(3) int lyingFlatIndex,

    /// Narrative line describing the current activity.
    String? narrativeDescription,

    /// A quote from the lobster reflecting on life.
    String? lobsterQuote,

    /// ISO-8601 timestamp when this activity started.
    required String startedAt,
  }) = _ActivityState;

  factory ActivityState.fromJson(Map<String, Object?> json) =>
      _$ActivityStateFromJson(json);
}
