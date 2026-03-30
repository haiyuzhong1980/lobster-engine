// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'diary.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$DiaryEntryImpl _$$DiaryEntryImplFromJson(Map<String, dynamic> json) =>
    _$DiaryEntryImpl(
      id: json['id'] as String,
      lobsterId: json['lobsterId'] as String,
      content: json['content'] as String,
      summary: json['summary'] as String?,
      dominantEmotion: json['dominantEmotion'] as String?,
      highlights: (json['highlights'] as List<dynamic>?)
              ?.map((e) => e as String)
              .toList() ??
          const [],
      entryDate: json['entryDate'] as String,
      generatedAt: json['generatedAt'] as String,
    );

Map<String, dynamic> _$$DiaryEntryImplToJson(_$DiaryEntryImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'lobsterId': instance.lobsterId,
      'content': instance.content,
      if (instance.summary != null) 'summary': instance.summary,
      if (instance.dominantEmotion != null)
        'dominantEmotion': instance.dominantEmotion,
      if (instance.highlights.isNotEmpty) 'highlights': instance.highlights,
      'entryDate': instance.entryDate,
      'generatedAt': instance.generatedAt,
    };

_$DiaryTimelineImpl _$$DiaryTimelineImplFromJson(Map<String, dynamic> json) =>
    _$DiaryTimelineImpl(
      entries: (json['entries'] as List<dynamic>)
          .map((e) => DiaryEntry.fromJson(e as Map<String, dynamic>))
          .toList(),
      total: (json['total'] as num).toInt(),
      hasMore: json['hasMore'] as bool,
    );

Map<String, dynamic> _$$DiaryTimelineImplToJson(
        _$DiaryTimelineImpl instance) =>
    <String, dynamic>{
      'entries': instance.entries.map((e) => e.toJson()).toList(),
      'total': instance.total,
      'hasMore': instance.hasMore,
    };
