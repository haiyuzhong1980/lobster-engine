import 'package:freezed_annotation/freezed_annotation.dart';

part 'social_relation.freezed.dart';
part 'social_relation.g.dart';

/// The tier of a social bond between two lobsters.
enum RelationTier {
  /// Just met — first encounter.
  acquaintance,

  /// Seen multiple times — a familiar face.
  familiar,

  /// Frequent meetings — becoming friends.
  friend,

  /// Deep bond — best lobster buddies.
  bestFriend,

  /// A special romantic connection.
  crush,
}

/// A directional social relation from one lobster to another.
@freezed
class SocialRelation with _$SocialRelation {
  const factory SocialRelation({
    /// Unique relation ID.
    required String id,

    /// The lobster that owns this relation view.
    required String lobsterId,

    /// The peer lobster on the other end.
    required String peerId,

    /// Display name of the peer (denormalised).
    String? peerName,

    /// Avatar URL of the peer (denormalised).
    String? peerAvatarUrl,

    /// Bond tier.
    @Default(RelationTier.acquaintance) RelationTier tier,

    /// Total number of encounters between the two.
    @Default(0) int encounterCount,

    /// Bond score (higher = closer relationship).
    @Default(0.0) double bondScore,

    /// Whether the peer has confirmed / reciprocated the relation.
    @Default(false) bool confirmed,

    /// ISO-8601 timestamp of last interaction.
    String? lastInteractionAt,

    /// ISO-8601 timestamp when the relation was first created.
    required String createdAt,
  }) = _SocialRelation;

  factory SocialRelation.fromJson(Map<String, Object?> json) =>
      _$SocialRelationFromJson(json);
}

/// Result from sending a gift.
@freezed
class GiftResult with _$GiftResult {
  const factory GiftResult({
    /// Whether the gift was delivered successfully.
    required bool success,

    /// New shell balance of the sender after the transaction.
    required int newBalance,

    /// Human-readable result message.
    String? message,
  }) = _GiftResult;

  factory GiftResult.fromJson(Map<String, Object?> json) =>
      _$GiftResultFromJson(json);
}

/// Result from confirming a relation.
@freezed
class ConfirmResult with _$ConfirmResult {
  const factory ConfirmResult({
    /// Whether the confirmation succeeded.
    required bool success,

    /// The updated relation (null on failure).
    SocialRelation? relation,

    /// Human-readable result message.
    String? message,
  }) = _ConfirmResult;

  factory ConfirmResult.fromJson(Map<String, Object?> json) =>
      _$ConfirmResultFromJson(json);
}

/// A group effect visible to lobsters in a geographic region.
@freezed
class GroupEffect with _$GroupEffect {
  const factory GroupEffect({
    /// Unique group effect ID.
    required String id,

    /// GeoHash that this group effect covers.
    required String geoHash,

    /// Effect type, e.g. 'chill_boost', 'energy_drain', 'mood_lift'.
    required String effectType,

    /// Effect magnitude (0.0–1.0).
    required double magnitude,

    /// Number of lobsters contributing to this effect.
    required int participantCount,

    /// Human-readable description.
    String? description,

    /// ISO-8601 timestamp when this effect expires.
    String? expiresAt,
  }) = _GroupEffect;

  factory GroupEffect.fromJson(Map<String, Object?> json) =>
      _$GroupEffectFromJson(json);
}
