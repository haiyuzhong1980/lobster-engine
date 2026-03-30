// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'encounter.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

EncounterRecord _$EncounterRecordFromJson(Map<String, dynamic> json) {
  return _EncounterRecord.fromJson(json);
}

mixin _$EncounterRecord {
  String get id => throw _privateConstructorUsedError;
  String get reporterId => throw _privateConstructorUsedError;
  String get peerId => throw _privateConstructorUsedError;
  String? get peerName => throw _privateConstructorUsedError;
  String? get peerAvatarUrl => throw _privateConstructorUsedError;
  EncounterMethod get method => throw _privateConstructorUsedError;
  int? get rssi => throw _privateConstructorUsedError;
  String? get geoHash => throw _privateConstructorUsedError;
  String get relationImpact => throw _privateConstructorUsedError;
  String get encounteredAt => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $EncounterRecordCopyWith<EncounterRecord> get copyWith =>
      throw _privateConstructorUsedError;
}

abstract class $EncounterRecordCopyWith<$Res> {
  factory $EncounterRecordCopyWith(
          EncounterRecord value, $Res Function(EncounterRecord) then) =
      _$EncounterRecordCopyWithImpl<$Res, EncounterRecord>;
  @useResult
  $Res call({
    String id,
    String reporterId,
    String peerId,
    String? peerName,
    String? peerAvatarUrl,
    EncounterMethod method,
    int? rssi,
    String? geoHash,
    String relationImpact,
    String encounteredAt,
  });
}

class _$EncounterRecordCopyWithImpl<$Res, $Val extends EncounterRecord>
    implements $EncounterRecordCopyWith<$Res> {
  _$EncounterRecordCopyWithImpl(this._value, this._then);

  final $Val _value;
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? reporterId = null,
    Object? peerId = null,
    Object? peerName = freezed,
    Object? peerAvatarUrl = freezed,
    Object? method = null,
    Object? rssi = freezed,
    Object? geoHash = freezed,
    Object? relationImpact = null,
    Object? encounteredAt = null,
  }) =>
      _then(_value.copyWith(
        id: null == id ? _value.id : id as String,
        reporterId: null == reporterId ? _value.reporterId : reporterId as String,
        peerId: null == peerId ? _value.peerId : peerId as String,
        peerName: freezed == peerName ? _value.peerName : peerName as String?,
        peerAvatarUrl: freezed == peerAvatarUrl
            ? _value.peerAvatarUrl
            : peerAvatarUrl as String?,
        method: null == method ? _value.method : method as EncounterMethod,
        rssi: freezed == rssi ? _value.rssi : rssi as int?,
        geoHash: freezed == geoHash ? _value.geoHash : geoHash as String?,
        relationImpact: null == relationImpact
            ? _value.relationImpact
            : relationImpact as String,
        encounteredAt: null == encounteredAt
            ? _value.encounteredAt
            : encounteredAt as String,
      ) as $Val);
}

abstract class _$$EncounterRecordImplCopyWith<$Res>
    implements $EncounterRecordCopyWith<$Res> {
  factory _$$EncounterRecordImplCopyWith(_$EncounterRecordImpl value,
          $Res Function(_$EncounterRecordImpl) then) =
      __$$EncounterRecordImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    String id,
    String reporterId,
    String peerId,
    String? peerName,
    String? peerAvatarUrl,
    EncounterMethod method,
    int? rssi,
    String? geoHash,
    String relationImpact,
    String encounteredAt,
  });
}

class __$$EncounterRecordImplCopyWithImpl<$Res>
    extends _$EncounterRecordCopyWithImpl<$Res, _$EncounterRecordImpl>
    implements _$$EncounterRecordImplCopyWith<$Res> {
  __$$EncounterRecordImplCopyWithImpl(
      _$EncounterRecordImpl _value, $Res Function(_$EncounterRecordImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? reporterId = null,
    Object? peerId = null,
    Object? peerName = freezed,
    Object? peerAvatarUrl = freezed,
    Object? method = null,
    Object? rssi = freezed,
    Object? geoHash = freezed,
    Object? relationImpact = null,
    Object? encounteredAt = null,
  }) =>
      _then(_$EncounterRecordImpl(
        id: null == id ? _value.id : id as String,
        reporterId: null == reporterId ? _value.reporterId : reporterId as String,
        peerId: null == peerId ? _value.peerId : peerId as String,
        peerName: freezed == peerName ? _value.peerName : peerName as String?,
        peerAvatarUrl: freezed == peerAvatarUrl
            ? _value.peerAvatarUrl
            : peerAvatarUrl as String?,
        method: null == method ? _value.method : method as EncounterMethod,
        rssi: freezed == rssi ? _value.rssi : rssi as int?,
        geoHash: freezed == geoHash ? _value.geoHash : geoHash as String?,
        relationImpact: null == relationImpact
            ? _value.relationImpact
            : relationImpact as String,
        encounteredAt: null == encounteredAt
            ? _value.encounteredAt
            : encounteredAt as String,
      ));
}

@JsonSerializable()
class _$EncounterRecordImpl implements _EncounterRecord {
  const _$EncounterRecordImpl({
    required this.id,
    required this.reporterId,
    required this.peerId,
    this.peerName,
    this.peerAvatarUrl,
    required this.method,
    this.rssi,
    this.geoHash,
    this.relationImpact = 'neutral',
    required this.encounteredAt,
  });

  factory _$EncounterRecordImpl.fromJson(Map<String, dynamic> json) =>
      _$$EncounterRecordImplFromJson(json);

  @override
  final String id;
  @override
  final String reporterId;
  @override
  final String peerId;
  @override
  final String? peerName;
  @override
  final String? peerAvatarUrl;
  @override
  final EncounterMethod method;
  @override
  final int? rssi;
  @override
  final String? geoHash;
  @override
  @JsonKey()
  final String relationImpact;
  @override
  final String encounteredAt;

  @override
  String toString() =>
      'EncounterRecord(id: $id, reporterId: $reporterId, peerId: $peerId, method: $method, encounteredAt: $encounteredAt)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other.runtimeType == runtimeType &&
          other is _$EncounterRecordImpl &&
          other.id == id);

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(runtimeType, id);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$EncounterRecordImplCopyWith<_$EncounterRecordImpl> get copyWith =>
      __$$EncounterRecordImplCopyWithImpl<_$EncounterRecordImpl>(
          this, _$identity);

  @override
  Map<String, dynamic> toJson() => _$$EncounterRecordImplToJson(this);
}

abstract class _EncounterRecord implements EncounterRecord {
  const factory _EncounterRecord({
    required final String id,
    required final String reporterId,
    required final String peerId,
    final String? peerName,
    final String? peerAvatarUrl,
    required final EncounterMethod method,
    final int? rssi,
    final String? geoHash,
    final String relationImpact,
    required final String encounteredAt,
  }) = _$EncounterRecordImpl;

  factory _EncounterRecord.fromJson(Map<String, dynamic> json) =
      _$EncounterRecordImpl.fromJson;

  @override
  String get id;
  @override
  String get reporterId;
  @override
  String get peerId;
  @override
  String? get peerName;
  @override
  String? get peerAvatarUrl;
  @override
  EncounterMethod get method;
  @override
  int? get rssi;
  @override
  String? get geoHash;
  @override
  String get relationImpact;
  @override
  String get encounteredAt;
  @override
  @JsonKey(ignore: true)
  _$$EncounterRecordImplCopyWith<_$EncounterRecordImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

// EncounterReportResult -------------------------------------------------------

EncounterReportResult _$EncounterReportResultFromJson(
        Map<String, dynamic> json) =>
    _EncounterReportResult.fromJson(json);

mixin _$EncounterReportResult {
  bool get success => throw _privateConstructorUsedError;
  EncounterRecord? get encounter => throw _privateConstructorUsedError;
  String? get message => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $EncounterReportResultCopyWith<EncounterReportResult> get copyWith =>
      throw _privateConstructorUsedError;
}

abstract class $EncounterReportResultCopyWith<$Res> {
  factory $EncounterReportResultCopyWith(EncounterReportResult value,
          $Res Function(EncounterReportResult) then) =
      _$EncounterReportResultCopyWithImpl<$Res, EncounterReportResult>;
  @useResult
  $Res call({bool success, EncounterRecord? encounter, String? message});
}

class _$EncounterReportResultCopyWithImpl<$Res,
        $Val extends EncounterReportResult>
    implements $EncounterReportResultCopyWith<$Res> {
  _$EncounterReportResultCopyWithImpl(this._value, this._then);
  final $Val _value;
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? success = null,
    Object? encounter = freezed,
    Object? message = freezed,
  }) =>
      _then(_value.copyWith(
        success: null == success ? _value.success : success as bool,
        encounter:
            freezed == encounter ? _value.encounter : encounter as EncounterRecord?,
        message: freezed == message ? _value.message : message as String?,
      ) as $Val);
}

abstract class _$$EncounterReportResultImplCopyWith<$Res>
    implements $EncounterReportResultCopyWith<$Res> {
  factory _$$EncounterReportResultImplCopyWith(
          _$EncounterReportResultImpl value,
          $Res Function(_$EncounterReportResultImpl) then) =
      __$$EncounterReportResultImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({bool success, EncounterRecord? encounter, String? message});
}

class __$$EncounterReportResultImplCopyWithImpl<$Res>
    extends _$EncounterReportResultCopyWithImpl<$Res,
        _$EncounterReportResultImpl>
    implements _$$EncounterReportResultImplCopyWith<$Res> {
  __$$EncounterReportResultImplCopyWithImpl(_$EncounterReportResultImpl _value,
      $Res Function(_$EncounterReportResultImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? success = null,
    Object? encounter = freezed,
    Object? message = freezed,
  }) =>
      _then(_$EncounterReportResultImpl(
        success: null == success ? _value.success : success as bool,
        encounter:
            freezed == encounter ? _value.encounter : encounter as EncounterRecord?,
        message: freezed == message ? _value.message : message as String?,
      ));
}

@JsonSerializable()
class _$EncounterReportResultImpl implements _EncounterReportResult {
  const _$EncounterReportResultImpl({
    required this.success,
    this.encounter,
    this.message,
  });

  factory _$EncounterReportResultImpl.fromJson(Map<String, dynamic> json) =>
      _$$EncounterReportResultImplFromJson(json);

  @override
  final bool success;
  @override
  final EncounterRecord? encounter;
  @override
  final String? message;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other.runtimeType == runtimeType &&
          other is _$EncounterReportResultImpl &&
          other.success == success);

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(runtimeType, success, encounter, message);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$EncounterReportResultImplCopyWith<_$EncounterReportResultImpl>
      get copyWith =>
          __$$EncounterReportResultImplCopyWithImpl<_$EncounterReportResultImpl>(
              this, _$identity);

  @override
  Map<String, dynamic> toJson() => _$$EncounterReportResultImplToJson(this);
}

abstract class _EncounterReportResult implements EncounterReportResult {
  const factory _EncounterReportResult({
    required final bool success,
    final EncounterRecord? encounter,
    final String? message,
  }) = _$EncounterReportResultImpl;

  factory _EncounterReportResult.fromJson(Map<String, dynamic> json) =
      _$EncounterReportResultImpl.fromJson;

  @override
  bool get success;
  @override
  EncounterRecord? get encounter;
  @override
  String? get message;
  @override
  @JsonKey(ignore: true)
  _$$EncounterReportResultImplCopyWith<_$EncounterReportResultImpl>
      get copyWith => throw _privateConstructorUsedError;
}

// ignore: unused_element
const freezed = Object();
