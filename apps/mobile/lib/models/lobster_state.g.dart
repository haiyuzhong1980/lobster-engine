// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'lobster_state.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$LobsterStateImpl _$$LobsterStateImplFromJson(Map<String, dynamic> json) =>
    _$LobsterStateImpl(
      id: json['id'] as String,
      name: json['name'] as String,
      ownerId: json['ownerId'] as String,
      emotion: EmotionState.fromJson(
          json['emotion'] as Map<String, dynamic>),
      personality: PersonalityDna.fromJson(
          json['personality'] as Map<String, dynamic>),
      energy: (json['energy'] as num?)?.toInt() ?? 100,
      happiness: (json['happiness'] as num?)?.toInt() ?? 50,
      chillScore: (json['chillScore'] as num?)?.toInt() ?? 50,
      shellBalance: (json['shellBalance'] as num?)?.toInt() ?? 0,
      xp: (json['xp'] as num?)?.toInt() ?? 0,
      level: (json['level'] as num?)?.toInt() ?? 1,
      updatedAt: json['updatedAt'] as String,
      createdAt: json['createdAt'] as String,
      currentSceneId: json['currentSceneId'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
    );

Map<String, dynamic> _$$LobsterStateImplToJson(
        _$LobsterStateImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'ownerId': instance.ownerId,
      'emotion': instance.emotion.toJson(),
      'personality': instance.personality.toJson(),
      if (instance.energy != 100) 'energy': instance.energy,
      if (instance.happiness != 50) 'happiness': instance.happiness,
      if (instance.chillScore != 50) 'chillScore': instance.chillScore,
      if (instance.shellBalance != 0) 'shellBalance': instance.shellBalance,
      if (instance.xp != 0) 'xp': instance.xp,
      if (instance.level != 1) 'level': instance.level,
      'updatedAt': instance.updatedAt,
      'createdAt': instance.createdAt,
      if (instance.currentSceneId != null)
        'currentSceneId': instance.currentSceneId,
      if (instance.avatarUrl != null) 'avatarUrl': instance.avatarUrl,
    };
