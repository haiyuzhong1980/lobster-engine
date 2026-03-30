// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'emotion_state.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$EmotionStateImpl _$$EmotionStateImplFromJson(Map<String, dynamic> json) =>
    _$EmotionStateImpl(
      type: $enumDecode(_$EmotionTypeEnumMap, json['type']),
      intensity: (json['intensity'] as num?)?.toDouble() ?? 0.5,
      description: json['description'] as String?,
      trigger: json['trigger'] as String?,
      activatedAt: json['activatedAt'] as String,
      expiresAt: json['expiresAt'] as String?,
    );

Map<String, dynamic> _$$EmotionStateImplToJson(_$EmotionStateImpl instance) =>
    <String, dynamic>{
      'type': _$EmotionTypeEnumMap[instance.type]!,
      if (instance.intensity != 0.5) 'intensity': instance.intensity,
      if (instance.description != null) 'description': instance.description,
      if (instance.trigger != null) 'trigger': instance.trigger,
      'activatedAt': instance.activatedAt,
      if (instance.expiresAt != null) 'expiresAt': instance.expiresAt,
    };

const _$EmotionTypeEnumMap = {
  EmotionType.chill: 'chill',
  EmotionType.happy: 'happy',
  EmotionType.stressed: 'stressed',
  EmotionType.curious: 'curious',
  EmotionType.lonely: 'lonely',
  EmotionType.focused: 'focused',
  EmotionType.sleepy: 'sleepy',
  EmotionType.excited: 'excited',
};
