// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'personality_dna.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$PersonalityTraitImpl _$$PersonalityTraitImplFromJson(
        Map<String, dynamic> json) =>
    _$PersonalityTraitImpl(
      key: json['key'] as String,
      label: json['label'] as String,
      value: (json['value'] as num).toDouble(),
      plasticity: (json['plasticity'] as num?)?.toDouble() ?? 0.1,
    );

Map<String, dynamic> _$$PersonalityTraitImplToJson(
        _$PersonalityTraitImpl instance) =>
    <String, dynamic>{
      'key': instance.key,
      'label': instance.label,
      'value': instance.value,
      if (instance.plasticity != 0.1) 'plasticity': instance.plasticity,
    };

_$PersonalityDnaImpl _$$PersonalityDnaImplFromJson(
        Map<String, dynamic> json) =>
    _$PersonalityDnaImpl(
      archetype: $enumDecode(
          _$PersonalityArchetypeEnumMap, json['archetype']),
      traits: (json['traits'] as List<dynamic>)
          .map((e) =>
              PersonalityTrait.fromJson(e as Map<String, dynamic>))
          .toList(),
      narrative: json['narrative'] as String?,
      lastEvolvedAt: json['lastEvolvedAt'] as String?,
    );

Map<String, dynamic> _$$PersonalityDnaImplToJson(
        _$PersonalityDnaImpl instance) =>
    <String, dynamic>{
      'archetype': _$PersonalityArchetypeEnumMap[instance.archetype]!,
      'traits': instance.traits.map((e) => e.toJson()).toList(),
      if (instance.narrative != null) 'narrative': instance.narrative,
      if (instance.lastEvolvedAt != null)
        'lastEvolvedAt': instance.lastEvolvedAt,
    };

const _$PersonalityArchetypeEnumMap = {
  PersonalityArchetype.slowLiver: 'slowLiver',
  PersonalityArchetype.explorer: 'explorer',
  PersonalityArchetype.socialButterfly: 'socialButterfly',
  PersonalityArchetype.loner: 'loner',
};
