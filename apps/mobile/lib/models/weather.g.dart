// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'weather.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$WeatherLobsterEffectImpl _$$WeatherLobsterEffectImplFromJson(
        Map<String, dynamic> json) =>
    _$WeatherLobsterEffectImpl(
      emotionBias: json['emotionBias'] as String,
      chillDelta: (json['chillDelta'] as num?)?.toInt() ?? 0,
      energyDelta: (json['energyDelta'] as num?)?.toInt() ?? 0,
      narrative: json['narrative'] as String?,
    );

Map<String, dynamic> _$$WeatherLobsterEffectImplToJson(
        _$WeatherLobsterEffectImpl instance) =>
    <String, dynamic>{
      'emotionBias': instance.emotionBias,
      if (instance.chillDelta != 0) 'chillDelta': instance.chillDelta,
      if (instance.energyDelta != 0) 'energyDelta': instance.energyDelta,
      if (instance.narrative != null) 'narrative': instance.narrative,
    };

_$WeatherResponseImpl _$$WeatherResponseImplFromJson(
        Map<String, dynamic> json) =>
    _$WeatherResponseImpl(
      location: json['location'] as String,
      condition:
          $enumDecode(_$WeatherConditionEnumMap, json['condition']),
      temperatureCelsius: (json['temperatureCelsius'] as num).toDouble(),
      humidity: (json['humidity'] as num).toInt(),
      windSpeedKmh: (json['windSpeedKmh'] as num).toDouble(),
      uvIndex: (json['uvIndex'] as num?)?.toInt() ?? 0,
      lobsterEffect: WeatherLobsterEffect.fromJson(
          json['lobsterEffect'] as Map<String, dynamic>),
      fetchedAt: json['fetchedAt'] as String,
    );

Map<String, dynamic> _$$WeatherResponseImplToJson(
        _$WeatherResponseImpl instance) =>
    <String, dynamic>{
      'location': instance.location,
      'condition': _$WeatherConditionEnumMap[instance.condition]!,
      'temperatureCelsius': instance.temperatureCelsius,
      'humidity': instance.humidity,
      'windSpeedKmh': instance.windSpeedKmh,
      if (instance.uvIndex != 0) 'uvIndex': instance.uvIndex,
      'lobsterEffect': instance.lobsterEffect.toJson(),
      'fetchedAt': instance.fetchedAt,
    };

const _$WeatherConditionEnumMap = {
  WeatherCondition.clear: 'clear',
  WeatherCondition.partlyCloudy: 'partlyCloudy',
  WeatherCondition.cloudy: 'cloudy',
  WeatherCondition.rainy: 'rainy',
  WeatherCondition.stormy: 'stormy',
  WeatherCondition.snowy: 'snowy',
  WeatherCondition.foggy: 'foggy',
  WeatherCondition.windy: 'windy',
};
