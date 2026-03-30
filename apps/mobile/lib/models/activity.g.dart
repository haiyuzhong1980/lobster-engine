// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'activity.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$ActivityReportImpl _$$ActivityReportImplFromJson(
        Map<String, dynamic> json) =>
    _$ActivityReportImpl(
      lobsterId: json['lobsterId'] as String,
      type: $enumDecode(_$SensorActivityTypeEnumMap, json['type']),
      confidence: (json['confidence'] as num).toDouble(),
      metadata: (json['metadata'] as Map<String, dynamic>?)?.map(
              (k, v) => MapEntry(k, v as Object)) ??
          const {},
      detectedAt: json['detectedAt'] as String,
    );

Map<String, dynamic> _$$ActivityReportImplToJson(
        _$ActivityReportImpl instance) =>
    <String, dynamic>{
      'lobsterId': instance.lobsterId,
      'type': _$SensorActivityTypeEnumMap[instance.type]!,
      'confidence': instance.confidence,
      if (instance.metadata.isNotEmpty) 'metadata': instance.metadata,
      'detectedAt': instance.detectedAt,
    };

_$ActivityResponseImpl _$$ActivityResponseImplFromJson(
        Map<String, dynamic> json) =>
    _$ActivityResponseImpl(
      accepted: json['accepted'] as bool,
      currentActivity:
          $enumDecode(_$SensorActivityTypeEnumMap, json['currentActivity']),
      xpGranted: (json['xpGranted'] as num?)?.toInt() ?? 0,
      message: json['message'] as String?,
    );

Map<String, dynamic> _$$ActivityResponseImplToJson(
        _$ActivityResponseImpl instance) =>
    <String, dynamic>{
      'accepted': instance.accepted,
      'currentActivity': _$SensorActivityTypeEnumMap[instance.currentActivity]!,
      if (instance.xpGranted != 0) 'xpGranted': instance.xpGranted,
      if (instance.message != null) 'message': instance.message,
    };

_$SensorStateImpl _$$SensorStateImplFromJson(Map<String, dynamic> json) =>
    _$SensorStateImpl(
      current:
          $enumDecodeNullable(_$SensorActivityTypeEnumMap, json['current']) ??
              SensorActivityType.unknown,
      confidence: (json['confidence'] as num?)?.toDouble() ?? 0.0,
      accelerometerMagnitude:
          (json['accelerometerMagnitude'] as num?)?.toDouble() ?? 0.0,
      stepCount: (json['stepCount'] as num?)?.toInt(),
      lastUpdatedAt: json['lastUpdatedAt'] as String?,
    );

Map<String, dynamic> _$$SensorStateImplToJson(_$SensorStateImpl instance) =>
    <String, dynamic>{
      if (instance.current != SensorActivityType.unknown)
        'current': _$SensorActivityTypeEnumMap[instance.current]!,
      if (instance.confidence != 0.0) 'confidence': instance.confidence,
      if (instance.accelerometerMagnitude != 0.0)
        'accelerometerMagnitude': instance.accelerometerMagnitude,
      if (instance.stepCount != null) 'stepCount': instance.stepCount,
      if (instance.lastUpdatedAt != null)
        'lastUpdatedAt': instance.lastUpdatedAt,
    };

const _$SensorActivityTypeEnumMap = {
  SensorActivityType.stationary: 'stationary',
  SensorActivityType.walking: 'walking',
  SensorActivityType.running: 'running',
  SensorActivityType.cycling: 'cycling',
  SensorActivityType.transit: 'transit',
  SensorActivityType.indoorActive: 'indoorActive',
  SensorActivityType.resting: 'resting',
  SensorActivityType.unknown: 'unknown',
};
