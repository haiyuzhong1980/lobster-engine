// ignore_for_file: prefer_double_quotes

/// Types of activities the lobster may be engaged in.
enum ActivityType {
  lyingFlat,
  snacking,
  napping,
  strolling,
  bubbleWatching,
  deepThinking,
  socializing,
  collectingShells,
  stargazing,
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
  oceanFloor,
  coralReef,
  sandyBeach,
  kelpForest,
  deepSea,
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
class ActivityState {
  const ActivityState({
    required this.activity,
    required this.scene,
    this.lyingFlatIndex = 3,
    this.narrativeDescription,
    this.lobsterQuote,
    required this.startedAt,
  });

  final ActivityType activity;
  final SceneType scene;

  /// Lying-flat index 1–5 (how deeply the lobster is tangping).
  final int lyingFlatIndex;

  /// Narrative line describing the current activity.
  final String? narrativeDescription;

  /// A quote from the lobster reflecting on life.
  final String? lobsterQuote;

  /// ISO-8601 timestamp when this activity started.
  final String startedAt;

  ActivityState copyWith({
    ActivityType? activity,
    SceneType? scene,
    int? lyingFlatIndex,
    String? narrativeDescription,
    String? lobsterQuote,
    String? startedAt,
  }) {
    return ActivityState(
      activity: activity ?? this.activity,
      scene: scene ?? this.scene,
      lyingFlatIndex: lyingFlatIndex ?? this.lyingFlatIndex,
      narrativeDescription: narrativeDescription ?? this.narrativeDescription,
      lobsterQuote: lobsterQuote ?? this.lobsterQuote,
      startedAt: startedAt ?? this.startedAt,
    );
  }

  factory ActivityState.fromJson(Map<String, Object?> json) {
    return ActivityState(
      activity: _activityTypeFromJson(json['activity'] as String?),
      scene: _sceneTypeFromJson(json['scene'] as String?),
      lyingFlatIndex: (json['lyingFlatIndex'] as num?)?.toInt() ?? 3,
      narrativeDescription: json['narrativeDescription'] as String?,
      lobsterQuote: json['lobsterQuote'] as String?,
      startedAt: json['startedAt'] as String? ?? '',
    );
  }

  Map<String, Object?> toJson() {
    return {
      'activity': _activityTypeToJson(activity),
      'scene': _sceneTypeToJson(scene),
      'lyingFlatIndex': lyingFlatIndex,
      if (narrativeDescription != null)
        'narrativeDescription': narrativeDescription,
      if (lobsterQuote != null) 'lobsterQuote': lobsterQuote,
      'startedAt': startedAt,
    };
  }

  @override
  bool operator ==(Object other) {
    return other is ActivityState &&
        other.activity == activity &&
        other.scene == scene &&
        other.lyingFlatIndex == lyingFlatIndex &&
        other.narrativeDescription == narrativeDescription &&
        other.lobsterQuote == lobsterQuote &&
        other.startedAt == startedAt;
  }

  @override
  int get hashCode => Object.hash(
        activity,
        scene,
        lyingFlatIndex,
        narrativeDescription,
        lobsterQuote,
        startedAt,
      );
}

ActivityType _activityTypeFromJson(String? value) {
  switch (value) {
    case 'lying_flat':
      return ActivityType.lyingFlat;
    case 'snacking':
      return ActivityType.snacking;
    case 'napping':
      return ActivityType.napping;
    case 'strolling':
      return ActivityType.strolling;
    case 'bubble_watching':
      return ActivityType.bubbleWatching;
    case 'deep_thinking':
      return ActivityType.deepThinking;
    case 'socializing':
      return ActivityType.socializing;
    case 'collecting_shells':
      return ActivityType.collectingShells;
    case 'stargazing':
      return ActivityType.stargazing;
    case 'cloud_counting':
      return ActivityType.cloudCounting;
    default:
      return ActivityType.lyingFlat;
  }
}

String _activityTypeToJson(ActivityType type) {
  switch (type) {
    case ActivityType.lyingFlat:
      return 'lying_flat';
    case ActivityType.snacking:
      return 'snacking';
    case ActivityType.napping:
      return 'napping';
    case ActivityType.strolling:
      return 'strolling';
    case ActivityType.bubbleWatching:
      return 'bubble_watching';
    case ActivityType.deepThinking:
      return 'deep_thinking';
    case ActivityType.socializing:
      return 'socializing';
    case ActivityType.collectingShells:
      return 'collecting_shells';
    case ActivityType.stargazing:
      return 'stargazing';
    case ActivityType.cloudCounting:
      return 'cloud_counting';
  }
}

SceneType _sceneTypeFromJson(String? value) {
  switch (value) {
    case 'ocean_floor':
      return SceneType.oceanFloor;
    case 'coral_reef':
      return SceneType.coralReef;
    case 'sandy_beach':
      return SceneType.sandyBeach;
    case 'kelp_forest':
      return SceneType.kelpForest;
    case 'deep_sea':
      return SceneType.deepSea;
    case 'tide_pool':
      return SceneType.tidePool;
    default:
      return SceneType.oceanFloor;
  }
}

String _sceneTypeToJson(SceneType scene) {
  switch (scene) {
    case SceneType.oceanFloor:
      return 'ocean_floor';
    case SceneType.coralReef:
      return 'coral_reef';
    case SceneType.sandyBeach:
      return 'sandy_beach';
    case SceneType.kelpForest:
      return 'kelp_forest';
    case SceneType.deepSea:
      return 'deep_sea';
    case SceneType.tidePool:
      return 'tide_pool';
  }
}
