import 'package:freezed_annotation/freezed_annotation.dart';

import 'package:tangping_lobster/models/emotion_state.dart';
import 'package:tangping_lobster/models/personality_dna.dart';

part 'lobster_state.freezed.dart';
part 'lobster_state.g.dart';

/// The complete snapshot of a lobster's state returned by the gateway.
@freezed
class LobsterState with _$LobsterState {
  const factory LobsterState({
    /// Unique lobster identifier.
    required String id,

    /// Display name chosen by the owner.
    required String name,

    /// ID of the owning user / device.
    required String ownerId,

    /// Current mood / emotion.
    required EmotionState emotion,

    /// Personality DNA snapshot.
    required PersonalityDna personality,

    /// Energy level 0–100.
    @Default(100) int energy,

    /// Happiness level 0–100.
    @Default(50) int happiness,

    /// Chill score 0–100 (how "tangping" the lobster is right now).
    @Default(50) int chillScore,

    /// Total shell currency balance.
    @Default(0) int shellBalance,

    /// Accumulated experience points.
    @Default(0) int xp,

    /// Current level derived from XP.
    @Default(1) int level,

    /// ISO-8601 timestamp of last state update.
    required String updatedAt,

    /// ISO-8601 timestamp when the lobster was registered.
    required String createdAt,

    /// Optional scene the lobster currently inhabits.
    String? currentSceneId,

    /// Optional URL to the lobster's avatar image.
    String? avatarUrl,
  }) = _LobsterState;

  factory LobsterState.fromJson(Map<String, Object?> json) =>
      _$LobsterStateFromJson(json);
}
