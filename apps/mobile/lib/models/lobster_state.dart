import 'package:tangping_lobster/models/emotion_state.dart';
import 'package:tangping_lobster/models/personality_dna.dart';

/// The complete snapshot of a lobster's state returned by the gateway.
class LobsterState {
  const LobsterState({
    required this.id,
    required this.name,
    required this.ownerId,
    required this.emotion,
    required this.personality,
    this.energy = 100,
    this.happiness = 50,
    this.chillScore = 50,
    this.shellBalance = 0,
    this.xp = 0,
    this.level = 1,
    required this.updatedAt,
    required this.createdAt,
    this.currentSceneId,
    this.avatarUrl,
  });

  /// Unique lobster identifier.
  final String id;

  /// Display name chosen by the owner.
  final String name;

  /// ID of the owning user / device.
  final String ownerId;

  /// Current mood / emotion.
  final EmotionState emotion;

  /// Personality DNA snapshot.
  final PersonalityDna personality;

  /// Energy level 0–100.
  final int energy;

  /// Happiness level 0–100.
  final int happiness;

  /// Chill score 0–100 (how "tangping" the lobster is right now).
  final int chillScore;

  /// Total shell currency balance.
  final int shellBalance;

  /// Accumulated experience points.
  final int xp;

  /// Current level derived from XP.
  final int level;

  /// ISO-8601 timestamp of last state update.
  final String updatedAt;

  /// ISO-8601 timestamp when the lobster was registered.
  final String createdAt;

  /// Optional scene the lobster currently inhabits.
  final String? currentSceneId;

  /// Optional URL to the lobster's avatar image.
  final String? avatarUrl;

  LobsterState copyWith({
    String? id,
    String? name,
    String? ownerId,
    EmotionState? emotion,
    PersonalityDna? personality,
    int? energy,
    int? happiness,
    int? chillScore,
    int? shellBalance,
    int? xp,
    int? level,
    String? updatedAt,
    String? createdAt,
    String? currentSceneId,
    String? avatarUrl,
  }) {
    return LobsterState(
      id: id ?? this.id,
      name: name ?? this.name,
      ownerId: ownerId ?? this.ownerId,
      emotion: emotion ?? this.emotion,
      personality: personality ?? this.personality,
      energy: energy ?? this.energy,
      happiness: happiness ?? this.happiness,
      chillScore: chillScore ?? this.chillScore,
      shellBalance: shellBalance ?? this.shellBalance,
      xp: xp ?? this.xp,
      level: level ?? this.level,
      updatedAt: updatedAt ?? this.updatedAt,
      createdAt: createdAt ?? this.createdAt,
      currentSceneId: currentSceneId ?? this.currentSceneId,
      avatarUrl: avatarUrl ?? this.avatarUrl,
    );
  }

  factory LobsterState.fromJson(Map<String, Object?> json) {
    final emotionJson = json['emotion'];
    final personalityJson = json['personality'];
    return LobsterState(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      ownerId: json['ownerId'] as String? ?? '',
      emotion: emotionJson is Map
          ? EmotionState.fromJson(emotionJson.cast<String, Object?>())
          : const EmotionState(
              type: EmotionType.chill, activatedAt: ''),
      personality: personalityJson is Map
          ? PersonalityDna.fromJson(personalityJson.cast<String, Object?>())
          : const PersonalityDna(
              archetype: PersonalityArchetype.slowLiver, traits: []),
      energy: (json['energy'] as num?)?.toInt() ?? 100,
      happiness: (json['happiness'] as num?)?.toInt() ?? 50,
      chillScore: (json['chillScore'] as num?)?.toInt() ?? 50,
      shellBalance: (json['shellBalance'] as num?)?.toInt() ?? 0,
      xp: (json['xp'] as num?)?.toInt() ?? 0,
      level: (json['level'] as num?)?.toInt() ?? 1,
      updatedAt: json['updatedAt'] as String? ?? '',
      createdAt: json['createdAt'] as String? ?? '',
      currentSceneId: json['currentSceneId'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
    );
  }

  Map<String, Object?> toJson() {
    return {
      'id': id,
      'name': name,
      'ownerId': ownerId,
      'emotion': emotion.toJson(),
      'personality': personality.toJson(),
      'energy': energy,
      'happiness': happiness,
      'chillScore': chillScore,
      'shellBalance': shellBalance,
      'xp': xp,
      'level': level,
      'updatedAt': updatedAt,
      'createdAt': createdAt,
      if (currentSceneId != null) 'currentSceneId': currentSceneId,
      if (avatarUrl != null) 'avatarUrl': avatarUrl,
    };
  }

  @override
  bool operator ==(Object other) {
    return other is LobsterState &&
        other.id == id &&
        other.updatedAt == updatedAt;
  }

  @override
  int get hashCode => Object.hash(id, updatedAt);
}
