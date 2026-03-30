// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'social_relation.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$SocialRelationImpl _$$SocialRelationImplFromJson(
        Map<String, dynamic> json) =>
    _$SocialRelationImpl(
      id: json['id'] as String,
      lobsterId: json['lobsterId'] as String,
      peerId: json['peerId'] as String,
      peerName: json['peerName'] as String?,
      peerAvatarUrl: json['peerAvatarUrl'] as String?,
      tier: $enumDecodeNullable(_$RelationTierEnumMap, json['tier']) ??
          RelationTier.acquaintance,
      encounterCount: (json['encounterCount'] as num?)?.toInt() ?? 0,
      bondScore: (json['bondScore'] as num?)?.toDouble() ?? 0.0,
      confirmed: json['confirmed'] as bool? ?? false,
      lastInteractionAt: json['lastInteractionAt'] as String?,
      createdAt: json['createdAt'] as String,
    );

Map<String, dynamic> _$$SocialRelationImplToJson(
        _$SocialRelationImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'lobsterId': instance.lobsterId,
      'peerId': instance.peerId,
      if (instance.peerName != null) 'peerName': instance.peerName,
      if (instance.peerAvatarUrl != null) 'peerAvatarUrl': instance.peerAvatarUrl,
      if (instance.tier != RelationTier.acquaintance)
        'tier': _$RelationTierEnumMap[instance.tier]!,
      if (instance.encounterCount != 0)
        'encounterCount': instance.encounterCount,
      if (instance.bondScore != 0.0) 'bondScore': instance.bondScore,
      if (instance.confirmed) 'confirmed': instance.confirmed,
      if (instance.lastInteractionAt != null)
        'lastInteractionAt': instance.lastInteractionAt,
      'createdAt': instance.createdAt,
    };

const _$RelationTierEnumMap = {
  RelationTier.acquaintance: 'acquaintance',
  RelationTier.familiar: 'familiar',
  RelationTier.friend: 'friend',
  RelationTier.bestFriend: 'bestFriend',
  RelationTier.crush: 'crush',
};

_$GiftResultImpl _$$GiftResultImplFromJson(Map<String, dynamic> json) =>
    _$GiftResultImpl(
      success: json['success'] as bool,
      newBalance: (json['newBalance'] as num).toInt(),
      message: json['message'] as String?,
    );

Map<String, dynamic> _$$GiftResultImplToJson(_$GiftResultImpl instance) =>
    <String, dynamic>{
      'success': instance.success,
      'newBalance': instance.newBalance,
      if (instance.message != null) 'message': instance.message,
    };

_$ConfirmResultImpl _$$ConfirmResultImplFromJson(Map<String, dynamic> json) =>
    _$ConfirmResultImpl(
      success: json['success'] as bool,
      relation: json['relation'] == null
          ? null
          : SocialRelation.fromJson(
              json['relation'] as Map<String, dynamic>),
      message: json['message'] as String?,
    );

Map<String, dynamic> _$$ConfirmResultImplToJson(
        _$ConfirmResultImpl instance) =>
    <String, dynamic>{
      'success': instance.success,
      if (instance.relation != null) 'relation': instance.relation!.toJson(),
      if (instance.message != null) 'message': instance.message,
    };

_$GroupEffectImpl _$$GroupEffectImplFromJson(Map<String, dynamic> json) =>
    _$GroupEffectImpl(
      id: json['id'] as String,
      geoHash: json['geoHash'] as String,
      effectType: json['effectType'] as String,
      magnitude: (json['magnitude'] as num).toDouble(),
      participantCount: (json['participantCount'] as num).toInt(),
      description: json['description'] as String?,
      expiresAt: json['expiresAt'] as String?,
    );

Map<String, dynamic> _$$GroupEffectImplToJson(_$GroupEffectImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'geoHash': instance.geoHash,
      'effectType': instance.effectType,
      'magnitude': instance.magnitude,
      'participantCount': instance.participantCount,
      if (instance.description != null) 'description': instance.description,
      if (instance.expiresAt != null) 'expiresAt': instance.expiresAt,
    };
