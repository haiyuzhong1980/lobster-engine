// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'diary.dart';

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

DiaryEntry _$DiaryEntryFromJson(Map<String, dynamic> json) {
  return _DiaryEntry.fromJson(json);
}

mixin _$DiaryEntry {
  String get id => throw _privateConstructorUsedError;
  String get lobsterId => throw _privateConstructorUsedError;
  String get content => throw _privateConstructorUsedError;
  String? get summary => throw _privateConstructorUsedError;
  String? get dominantEmotion => throw _privateConstructorUsedError;
  List<String> get highlights => throw _privateConstructorUsedError;
  String get entryDate => throw _privateConstructorUsedError;
  String get generatedAt => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $DiaryEntryCopyWith<DiaryEntry> get copyWith =>
      throw _privateConstructorUsedError;
}

abstract class $DiaryEntryCopyWith<$Res> {
  factory $DiaryEntryCopyWith(
          DiaryEntry value, $Res Function(DiaryEntry) then) =
      _$DiaryEntryCopyWithImpl<$Res, DiaryEntry>;
  @useResult
  $Res call({
    String id,
    String lobsterId,
    String content,
    String? summary,
    String? dominantEmotion,
    List<String> highlights,
    String entryDate,
    String generatedAt,
  });
}

class _$DiaryEntryCopyWithImpl<$Res, $Val extends DiaryEntry>
    implements $DiaryEntryCopyWith<$Res> {
  _$DiaryEntryCopyWithImpl(this._value, this._then);
  final $Val _value;
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? lobsterId = null,
    Object? content = null,
    Object? summary = freezed,
    Object? dominantEmotion = freezed,
    Object? highlights = null,
    Object? entryDate = null,
    Object? generatedAt = null,
  }) =>
      _then(_value.copyWith(
        id: null == id ? _value.id : id as String,
        lobsterId: null == lobsterId ? _value.lobsterId : lobsterId as String,
        content: null == content ? _value.content : content as String,
        summary: freezed == summary ? _value.summary : summary as String?,
        dominantEmotion: freezed == dominantEmotion
            ? _value.dominantEmotion
            : dominantEmotion as String?,
        highlights:
            null == highlights ? _value.highlights : highlights as List<String>,
        entryDate: null == entryDate ? _value.entryDate : entryDate as String,
        generatedAt:
            null == generatedAt ? _value.generatedAt : generatedAt as String,
      ) as $Val);
}

abstract class _$$DiaryEntryImplCopyWith<$Res>
    implements $DiaryEntryCopyWith<$Res> {
  factory _$$DiaryEntryImplCopyWith(
          _$DiaryEntryImpl value, $Res Function(_$DiaryEntryImpl) then) =
      __$$DiaryEntryImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    String id,
    String lobsterId,
    String content,
    String? summary,
    String? dominantEmotion,
    List<String> highlights,
    String entryDate,
    String generatedAt,
  });
}

class __$$DiaryEntryImplCopyWithImpl<$Res>
    extends _$DiaryEntryCopyWithImpl<$Res, _$DiaryEntryImpl>
    implements _$$DiaryEntryImplCopyWith<$Res> {
  __$$DiaryEntryImplCopyWithImpl(
      _$DiaryEntryImpl _value, $Res Function(_$DiaryEntryImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? lobsterId = null,
    Object? content = null,
    Object? summary = freezed,
    Object? dominantEmotion = freezed,
    Object? highlights = null,
    Object? entryDate = null,
    Object? generatedAt = null,
  }) =>
      _then(_$DiaryEntryImpl(
        id: null == id ? _value.id : id as String,
        lobsterId: null == lobsterId ? _value.lobsterId : lobsterId as String,
        content: null == content ? _value.content : content as String,
        summary: freezed == summary ? _value.summary : summary as String?,
        dominantEmotion: freezed == dominantEmotion
            ? _value.dominantEmotion
            : dominantEmotion as String?,
        highlights:
            null == highlights ? _value._highlights : highlights as List<String>,
        entryDate: null == entryDate ? _value.entryDate : entryDate as String,
        generatedAt:
            null == generatedAt ? _value.generatedAt : generatedAt as String,
      ));
}

@JsonSerializable()
class _$DiaryEntryImpl implements _DiaryEntry {
  const _$DiaryEntryImpl({
    required this.id,
    required this.lobsterId,
    required this.content,
    this.summary,
    this.dominantEmotion,
    final List<String> highlights = const [],
    required this.entryDate,
    required this.generatedAt,
  }) : _highlights = highlights;

  factory _$DiaryEntryImpl.fromJson(Map<String, dynamic> json) =>
      _$$DiaryEntryImplFromJson(json);

  @override
  final String id;
  @override
  final String lobsterId;
  @override
  final String content;
  @override
  final String? summary;
  @override
  final String? dominantEmotion;
  final List<String> _highlights;
  @override
  @JsonKey()
  List<String> get highlights {
    if (_highlights is EqualUnmodifiableListView) return _highlights;
    return EqualUnmodifiableListView(_highlights);
  }

  @override
  final String entryDate;
  @override
  final String generatedAt;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other.runtimeType == runtimeType &&
          other is _$DiaryEntryImpl &&
          other.id == id);

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(runtimeType, id);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$DiaryEntryImplCopyWith<_$DiaryEntryImpl> get copyWith =>
      __$$DiaryEntryImplCopyWithImpl<_$DiaryEntryImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() => _$$DiaryEntryImplToJson(this);
}

abstract class _DiaryEntry implements DiaryEntry {
  const factory _DiaryEntry({
    required final String id,
    required final String lobsterId,
    required final String content,
    final String? summary,
    final String? dominantEmotion,
    final List<String> highlights,
    required final String entryDate,
    required final String generatedAt,
  }) = _$DiaryEntryImpl;

  factory _DiaryEntry.fromJson(Map<String, dynamic> json) =
      _$DiaryEntryImpl.fromJson;

  @override
  String get id;
  @override
  String get lobsterId;
  @override
  String get content;
  @override
  String? get summary;
  @override
  String? get dominantEmotion;
  @override
  List<String> get highlights;
  @override
  String get entryDate;
  @override
  String get generatedAt;
  @override
  @JsonKey(ignore: true)
  _$$DiaryEntryImplCopyWith<_$DiaryEntryImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

// DiaryTimeline ---------------------------------------------------------------

DiaryTimeline _$DiaryTimelineFromJson(Map<String, dynamic> json) =>
    _DiaryTimeline.fromJson(json);

mixin _$DiaryTimeline {
  List<DiaryEntry> get entries => throw _privateConstructorUsedError;
  int get total => throw _privateConstructorUsedError;
  bool get hasMore => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $DiaryTimelineCopyWith<DiaryTimeline> get copyWith =>
      throw _privateConstructorUsedError;
}

abstract class $DiaryTimelineCopyWith<$Res> {
  factory $DiaryTimelineCopyWith(
          DiaryTimeline value, $Res Function(DiaryTimeline) then) =
      _$DiaryTimelineCopyWithImpl<$Res, DiaryTimeline>;
  @useResult
  $Res call({List<DiaryEntry> entries, int total, bool hasMore});
}

class _$DiaryTimelineCopyWithImpl<$Res, $Val extends DiaryTimeline>
    implements $DiaryTimelineCopyWith<$Res> {
  _$DiaryTimelineCopyWithImpl(this._value, this._then);
  final $Val _value;
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? entries = null,
    Object? total = null,
    Object? hasMore = null,
  }) =>
      _then(_value.copyWith(
        entries: null == entries
            ? _value.entries
            : entries as List<DiaryEntry>,
        total: null == total ? _value.total : total as int,
        hasMore: null == hasMore ? _value.hasMore : hasMore as bool,
      ) as $Val);
}

abstract class _$$DiaryTimelineImplCopyWith<$Res>
    implements $DiaryTimelineCopyWith<$Res> {
  factory _$$DiaryTimelineImplCopyWith(_$DiaryTimelineImpl value,
          $Res Function(_$DiaryTimelineImpl) then) =
      __$$DiaryTimelineImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({List<DiaryEntry> entries, int total, bool hasMore});
}

class __$$DiaryTimelineImplCopyWithImpl<$Res>
    extends _$DiaryTimelineCopyWithImpl<$Res, _$DiaryTimelineImpl>
    implements _$$DiaryTimelineImplCopyWith<$Res> {
  __$$DiaryTimelineImplCopyWithImpl(
      _$DiaryTimelineImpl _value, $Res Function(_$DiaryTimelineImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? entries = null,
    Object? total = null,
    Object? hasMore = null,
  }) =>
      _then(_$DiaryTimelineImpl(
        entries: null == entries
            ? _value._entries
            : entries as List<DiaryEntry>,
        total: null == total ? _value.total : total as int,
        hasMore: null == hasMore ? _value.hasMore : hasMore as bool,
      ));
}

@JsonSerializable()
class _$DiaryTimelineImpl implements _DiaryTimeline {
  const _$DiaryTimelineImpl({
    required final List<DiaryEntry> entries,
    required this.total,
    required this.hasMore,
  }) : _entries = entries;

  factory _$DiaryTimelineImpl.fromJson(Map<String, dynamic> json) =>
      _$$DiaryTimelineImplFromJson(json);

  final List<DiaryEntry> _entries;
  @override
  List<DiaryEntry> get entries {
    if (_entries is EqualUnmodifiableListView) return _entries;
    return EqualUnmodifiableListView(_entries);
  }

  @override
  final int total;
  @override
  final bool hasMore;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other.runtimeType == runtimeType &&
          other is _$DiaryTimelineImpl &&
          const DeepCollectionEquality().equals(other._entries, _entries) &&
          other.total == total &&
          other.hasMore == hasMore);

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(
      runtimeType, const DeepCollectionEquality().hash(_entries), total, hasMore);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$DiaryTimelineImplCopyWith<_$DiaryTimelineImpl> get copyWith =>
      __$$DiaryTimelineImplCopyWithImpl<_$DiaryTimelineImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() => _$$DiaryTimelineImplToJson(this);
}

abstract class _DiaryTimeline implements DiaryTimeline {
  const factory _DiaryTimeline({
    required final List<DiaryEntry> entries,
    required final int total,
    required final bool hasMore,
  }) = _$DiaryTimelineImpl;

  factory _DiaryTimeline.fromJson(Map<String, dynamic> json) =
      _$DiaryTimelineImpl.fromJson;

  @override
  List<DiaryEntry> get entries;
  @override
  int get total;
  @override
  bool get hasMore;
  @override
  @JsonKey(ignore: true)
  _$$DiaryTimelineImplCopyWith<_$DiaryTimelineImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

// ignore: unused_element
const freezed = Object();

class EqualUnmodifiableListView<T> extends UnmodifiableListView<T> {
  const EqualUnmodifiableListView(super.source);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is List<T> &&
        const DeepCollectionEquality().equals(this, other);
  }

  @override
  int get hashCode => const DeepCollectionEquality().hash(this);
}
