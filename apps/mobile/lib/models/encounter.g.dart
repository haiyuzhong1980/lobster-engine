// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'encounter.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$EncounterRecordImpl _$$EncounterRecordImplFromJson(
        Map<String, dynamic> json) =>
    _$EncounterRecordImpl(
      id: json['id'] as String,
      reporterId: json['reporterId'] as String,
      peerId: json['peerId'] as String,
      peerName: json['peerName'] as String?,
      peerAvatarUrl: json['peerAvatarUrl'] as String?,
      method: $enumDecode(_$EncounterMethodEnumMap, json['method']),
      rssi: (json['rssi'] as num?)?.toInt(),
      geoHash: json['geoHash'] as String?,
      relationImpact: json['relationImpact'] as String? ?? 'neutral',
      encounteredAt: json['encounteredAt'] as String,
    );

Map<String, dynamic> _$$EncounterRecordImplToJson(
        _$EncounterRecordImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'reporterId': instance.reporterId,
      'peerId': instance.peerId,
      if (instance.peerName != null) 'peerName': instance.peerName,
      if (instance.peerAvatarUrl != null) 'peerAvatarUrl': instance.peerAvatarUrl,
      'method': _$EncounterMethodEnumMap[instance.method]!,
      if (instance.rssi != null) 'rssi': instance.rssi,
      if (instance.geoHash != null) 'geoHash': instance.geoHash,
      if (instance.relationImpact != 'neutral')
        'relationImpact': instance.relationImpact,
      'encounteredAt': instance.encounteredAt,
    };

const _$EncounterMethodEnumMap = {
  EncounterMethod.bluetooth: 'bluetooth',
  EncounterMethod.gps: 'gps',
  EncounterMethod.wifi: 'wifi',
  EncounterMethod.qr: 'qr',
  EncounterMethod.manual: 'manual',
};

_$EncounterReportResultImpl _$$EncounterReportResultImplFromJson(
        Map<String, dynamic> json) =>
    _$EncounterReportResultImpl(
      success: json['success'] as bool,
      encounter: json['encounter'] == null
          ? null
          : EncounterRecord.fromJson(
              json['encounter'] as Map<String, dynamic>),
      message: json['message'] as String?,
    );

Map<String, dynamic> _$$EncounterReportResultImplToJson(
        _$EncounterReportResultImpl instance) =>
    <String, dynamic>{
      'success': instance.success,
      if (instance.encounter != null) 'encounter': instance.encounter!.toJson(),
      if (instance.message != null) 'message': instance.message,
    };
