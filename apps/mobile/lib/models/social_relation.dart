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
class SocialRelation {
  const SocialRelation({
    required this.id,
    required this.lobsterId,
    required this.peerId,
    this.peerName,
    this.peerAvatarUrl,
    this.tier = RelationTier.acquaintance,
    this.encounterCount = 0,
    this.bondScore = 0.0,
    this.confirmed = false,
    this.lastInteractionAt,
    required this.createdAt,
  });

  /// Unique relation ID.
  final String id;

  /// The lobster that owns this relation view.
  final String lobsterId;

  /// The peer lobster on the other end.
  final String peerId;

  /// Display name of the peer (denormalised).
  final String? peerName;

  /// Avatar URL of the peer (denormalised).
  final String? peerAvatarUrl;

  /// Bond tier.
  final RelationTier tier;

  /// Total number of encounters between the two.
  final int encounterCount;

  /// Bond score (higher = closer relationship).
  final double bondScore;

  /// Whether the peer has confirmed / reciprocated the relation.
  final bool confirmed;

  /// ISO-8601 timestamp of last interaction.
  final String? lastInteractionAt;

  /// ISO-8601 timestamp when the relation was first created.
  final String createdAt;

  SocialRelation copyWith({
    String? id,
    String? lobsterId,
    String? peerId,
    String? peerName,
    String? peerAvatarUrl,
    RelationTier? tier,
    int? encounterCount,
    double? bondScore,
    bool? confirmed,
    String? lastInteractionAt,
    String? createdAt,
  }) {
    return SocialRelation(
      id: id ?? this.id,
      lobsterId: lobsterId ?? this.lobsterId,
      peerId: peerId ?? this.peerId,
      peerName: peerName ?? this.peerName,
      peerAvatarUrl: peerAvatarUrl ?? this.peerAvatarUrl,
      tier: tier ?? this.tier,
      encounterCount: encounterCount ?? this.encounterCount,
      bondScore: bondScore ?? this.bondScore,
      confirmed: confirmed ?? this.confirmed,
      lastInteractionAt: lastInteractionAt ?? this.lastInteractionAt,
      createdAt: createdAt ?? this.createdAt,
    );
  }

  factory SocialRelation.fromJson(Map<String, Object?> json) {
    return SocialRelation(
      id: json['id'] as String? ?? '',
      lobsterId: json['lobsterId'] as String? ?? '',
      peerId: json['peerId'] as String? ?? '',
      peerName: json['peerName'] as String?,
      peerAvatarUrl: json['peerAvatarUrl'] as String?,
      tier: _relationTierFromJson(json['tier'] as String?),
      encounterCount: (json['encounterCount'] as num?)?.toInt() ?? 0,
      bondScore: (json['bondScore'] as num?)?.toDouble() ?? 0.0,
      confirmed: json['confirmed'] as bool? ?? false,
      lastInteractionAt: json['lastInteractionAt'] as String?,
      createdAt: json['createdAt'] as String? ?? '',
    );
  }

  Map<String, Object?> toJson() {
    return {
      'id': id,
      'lobsterId': lobsterId,
      'peerId': peerId,
      if (peerName != null) 'peerName': peerName,
      if (peerAvatarUrl != null) 'peerAvatarUrl': peerAvatarUrl,
      'tier': tier.name,
      'encounterCount': encounterCount,
      'bondScore': bondScore,
      'confirmed': confirmed,
      if (lastInteractionAt != null) 'lastInteractionAt': lastInteractionAt,
      'createdAt': createdAt,
    };
  }

  @override
  bool operator ==(Object other) {
    return other is SocialRelation && other.id == id;
  }

  @override
  int get hashCode => id.hashCode;
}

/// Result from sending a gift.
class GiftResult {
  const GiftResult({
    required this.success,
    required this.newBalance,
    this.message,
  });

  /// Whether the gift was delivered successfully.
  final bool success;

  /// New shell balance of the sender after the transaction.
  final int newBalance;

  /// Human-readable result message.
  final String? message;

  factory GiftResult.fromJson(Map<String, Object?> json) {
    return GiftResult(
      success: json['success'] as bool? ?? false,
      newBalance: (json['newBalance'] as num?)?.toInt() ?? 0,
      message: json['message'] as String?,
    );
  }

  Map<String, Object?> toJson() {
    return {
      'success': success,
      'newBalance': newBalance,
      if (message != null) 'message': message,
    };
  }
}

/// Result from confirming a relation.
class ConfirmResult {
  const ConfirmResult({
    required this.success,
    this.relation,
    this.message,
  });

  /// Whether the confirmation succeeded.
  final bool success;

  /// The updated relation (null on failure).
  final SocialRelation? relation;

  /// Human-readable result message.
  final String? message;

  factory ConfirmResult.fromJson(Map<String, Object?> json) {
    final relationJson = json['relation'];
    return ConfirmResult(
      success: json['success'] as bool? ?? false,
      relation: relationJson is Map
          ? SocialRelation.fromJson(relationJson.cast<String, Object?>())
          : null,
      message: json['message'] as String?,
    );
  }

  Map<String, Object?> toJson() {
    return {
      'success': success,
      if (relation != null) 'relation': relation!.toJson(),
      if (message != null) 'message': message,
    };
  }
}

/// A group effect visible to lobsters in a geographic region.
class GroupEffect {
  const GroupEffect({
    required this.id,
    required this.geoHash,
    required this.effectType,
    required this.magnitude,
    required this.participantCount,
    this.description,
    this.expiresAt,
  });

  /// Unique group effect ID.
  final String id;

  /// GeoHash that this group effect covers.
  final String geoHash;

  /// Effect type, e.g. 'chill_boost', 'energy_drain', 'mood_lift'.
  final String effectType;

  /// Effect magnitude (0.0–1.0).
  final double magnitude;

  /// Number of lobsters contributing to this effect.
  final int participantCount;

  /// Human-readable description.
  final String? description;

  /// ISO-8601 timestamp when this effect expires.
  final String? expiresAt;

  factory GroupEffect.fromJson(Map<String, Object?> json) {
    return GroupEffect(
      id: json['id'] as String? ?? '',
      geoHash: json['geoHash'] as String? ?? '',
      effectType: json['effectType'] as String? ?? '',
      magnitude: (json['magnitude'] as num?)?.toDouble() ?? 0.0,
      participantCount: (json['participantCount'] as num?)?.toInt() ?? 0,
      description: json['description'] as String?,
      expiresAt: json['expiresAt'] as String?,
    );
  }

  Map<String, Object?> toJson() {
    return {
      'id': id,
      'geoHash': geoHash,
      'effectType': effectType,
      'magnitude': magnitude,
      'participantCount': participantCount,
      if (description != null) 'description': description,
      if (expiresAt != null) 'expiresAt': expiresAt,
    };
  }

  @override
  bool operator ==(Object other) {
    return other is GroupEffect && other.id == id;
  }

  @override
  int get hashCode => id.hashCode;
}

RelationTier _relationTierFromJson(String? value) {
  switch (value) {
    case 'acquaintance':
      return RelationTier.acquaintance;
    case 'familiar':
      return RelationTier.familiar;
    case 'friend':
      return RelationTier.friend;
    case 'bestFriend':
      return RelationTier.bestFriend;
    case 'crush':
      return RelationTier.crush;
    default:
      return RelationTier.acquaintance;
  }
}
