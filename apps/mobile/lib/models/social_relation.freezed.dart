// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'social_relation.dart';

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

SocialRelation _$SocialRelationFromJson(Map<String, dynamic> json) {
  return _SocialRelation.fromJson(json);
}

mixin _$SocialRelation {
  String get id => throw _privateConstructorUsedError;
  String get lobsterId => throw _privateConstructorUsedError;
  String get peerId => throw _privateConstructorUsedError;
  String? get peerName => throw _privateConstructorUsedError;
  String? get peerAvatarUrl => throw _privateConstructorUsedError;
  RelationTier get tier => throw _privateConstructorUsedError;
  int get encounterCount => throw _privateConstructorUsedError;
  double get bondScore => throw _privateConstructorUsedError;
  bool get confirmed => throw _privateConstructorUsedError;
  String? get lastInteractionAt => throw _privateConstructorUsedError;
  String get createdAt => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $SocialRelationCopyWith<SocialRelation> get copyWith =>
      throw _privateConstructorUsedError;
}

abstract class $SocialRelationCopyWith<$Res> {
  factory $SocialRelationCopyWith(
          SocialRelation value, $Res Function(SocialRelation) then) =
      _$SocialRelationCopyWithImpl<$Res, SocialRelation>;
  @useResult
  $Res call({
    String id,
    String lobsterId,
    String peerId,
    String? peerName,
    String? peerAvatarUrl,
    RelationTier tier,
    int encounterCount,
    double bondScore,
    bool confirmed,
    String? lastInteractionAt,
    String createdAt,
  });
}

class _$SocialRelationCopyWithImpl<$Res, $Val extends SocialRelation>
    implements $SocialRelationCopyWith<$Res> {
  _$SocialRelationCopyWithImpl(this._value, this._then);
  final $Val _value;
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? lobsterId = null,
    Object? peerId = null,
    Object? peerName = freezed,
    Object? peerAvatarUrl = freezed,
    Object? tier = null,
    Object? encounterCount = null,
    Object? bondScore = null,
    Object? confirmed = null,
    Object? lastInteractionAt = freezed,
    Object? createdAt = null,
  }) =>
      _then(_value.copyWith(
        id: null == id ? _value.id : id as String,
        lobsterId: null == lobsterId ? _value.lobsterId : lobsterId as String,
        peerId: null == peerId ? _value.peerId : peerId as String,
        peerName: freezed == peerName ? _value.peerName : peerName as String?,
        peerAvatarUrl: freezed == peerAvatarUrl
            ? _value.peerAvatarUrl
            : peerAvatarUrl as String?,
        tier: null == tier ? _value.tier : tier as RelationTier,
        encounterCount:
            null == encounterCount ? _value.encounterCount : encounterCount as int,
        bondScore: null == bondScore ? _value.bondScore : bondScore as double,
        confirmed: null == confirmed ? _value.confirmed : confirmed as bool,
        lastInteractionAt: freezed == lastInteractionAt
            ? _value.lastInteractionAt
            : lastInteractionAt as String?,
        createdAt: null == createdAt ? _value.createdAt : createdAt as String,
      ) as $Val);
}

abstract class _$$SocialRelationImplCopyWith<$Res>
    implements $SocialRelationCopyWith<$Res> {
  factory _$$SocialRelationImplCopyWith(_$SocialRelationImpl value,
          $Res Function(_$SocialRelationImpl) then) =
      __$$SocialRelationImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    String id,
    String lobsterId,
    String peerId,
    String? peerName,
    String? peerAvatarUrl,
    RelationTier tier,
    int encounterCount,
    double bondScore,
    bool confirmed,
    String? lastInteractionAt,
    String createdAt,
  });
}

class __$$SocialRelationImplCopyWithImpl<$Res>
    extends _$SocialRelationCopyWithImpl<$Res, _$SocialRelationImpl>
    implements _$$SocialRelationImplCopyWith<$Res> {
  __$$SocialRelationImplCopyWithImpl(
      _$SocialRelationImpl _value, $Res Function(_$SocialRelationImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? lobsterId = null,
    Object? peerId = null,
    Object? peerName = freezed,
    Object? peerAvatarUrl = freezed,
    Object? tier = null,
    Object? encounterCount = null,
    Object? bondScore = null,
    Object? confirmed = null,
    Object? lastInteractionAt = freezed,
    Object? createdAt = null,
  }) =>
      _then(_$SocialRelationImpl(
        id: null == id ? _value.id : id as String,
        lobsterId: null == lobsterId ? _value.lobsterId : lobsterId as String,
        peerId: null == peerId ? _value.peerId : peerId as String,
        peerName: freezed == peerName ? _value.peerName : peerName as String?,
        peerAvatarUrl: freezed == peerAvatarUrl
            ? _value.peerAvatarUrl
            : peerAvatarUrl as String?,
        tier: null == tier ? _value.tier : tier as RelationTier,
        encounterCount:
            null == encounterCount ? _value.encounterCount : encounterCount as int,
        bondScore: null == bondScore ? _value.bondScore : bondScore as double,
        confirmed: null == confirmed ? _value.confirmed : confirmed as bool,
        lastInteractionAt: freezed == lastInteractionAt
            ? _value.lastInteractionAt
            : lastInteractionAt as String?,
        createdAt: null == createdAt ? _value.createdAt : createdAt as String,
      ));
}

@JsonSerializable()
class _$SocialRelationImpl implements _SocialRelation {
  const _$SocialRelationImpl({
    required this.id,
    required this.lobsterId,
    required this.peerId,
    this.peerName,
    this.peerAvatarUrl,
    this.tier = RelationTier.acquaintance,
    this.encounterCount = 0,
    this.bondScore = 0.0,
    this.confirmed = false,
    this.lastInteractionAt,
    required this.createdAt,
  });

  factory _$SocialRelationImpl.fromJson(Map<String, dynamic> json) =>
      _$$SocialRelationImplFromJson(json);

  @override
  final String id;
  @override
  final String lobsterId;
  @override
  final String peerId;
  @override
  final String? peerName;
  @override
  final String? peerAvatarUrl;
  @override
  @JsonKey()
  final RelationTier tier;
  @override
  @JsonKey()
  final int encounterCount;
  @override
  @JsonKey()
  final double bondScore;
  @override
  @JsonKey()
  final bool confirmed;
  @override
  final String? lastInteractionAt;
  @override
  final String createdAt;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other.runtimeType == runtimeType &&
          other is _$SocialRelationImpl &&
          other.id == id);

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(runtimeType, id);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$SocialRelationImplCopyWith<_$SocialRelationImpl> get copyWith =>
      __$$SocialRelationImplCopyWithImpl<_$SocialRelationImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() => _$$SocialRelationImplToJson(this);
}

abstract class _SocialRelation implements SocialRelation {
  const factory _SocialRelation({
    required final String id,
    required final String lobsterId,
    required final String peerId,
    final String? peerName,
    final String? peerAvatarUrl,
    final RelationTier tier,
    final int encounterCount,
    final double bondScore,
    final bool confirmed,
    final String? lastInteractionAt,
    required final String createdAt,
  }) = _$SocialRelationImpl;

  factory _SocialRelation.fromJson(Map<String, dynamic> json) =
      _$SocialRelationImpl.fromJson;

  @override
  String get id;
  @override
  String get lobsterId;
  @override
  String get peerId;
  @override
  String? get peerName;
  @override
  String? get peerAvatarUrl;
  @override
  RelationTier get tier;
  @override
  int get encounterCount;
  @override
  double get bondScore;
  @override
  bool get confirmed;
  @override
  String? get lastInteractionAt;
  @override
  String get createdAt;
  @override
  @JsonKey(ignore: true)
  _$$SocialRelationImplCopyWith<_$SocialRelationImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

// GiftResult ------------------------------------------------------------------

GiftResult _$GiftResultFromJson(Map<String, dynamic> json) =>
    _GiftResult.fromJson(json);

mixin _$GiftResult {
  bool get success => throw _privateConstructorUsedError;
  int get newBalance => throw _privateConstructorUsedError;
  String? get message => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $GiftResultCopyWith<GiftResult> get copyWith =>
      throw _privateConstructorUsedError;
}

abstract class $GiftResultCopyWith<$Res> {
  factory $GiftResultCopyWith(
          GiftResult value, $Res Function(GiftResult) then) =
      _$GiftResultCopyWithImpl<$Res, GiftResult>;
  @useResult
  $Res call({bool success, int newBalance, String? message});
}

class _$GiftResultCopyWithImpl<$Res, $Val extends GiftResult>
    implements $GiftResultCopyWith<$Res> {
  _$GiftResultCopyWithImpl(this._value, this._then);
  final $Val _value;
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? success = null,
    Object? newBalance = null,
    Object? message = freezed,
  }) =>
      _then(_value.copyWith(
        success: null == success ? _value.success : success as bool,
        newBalance: null == newBalance ? _value.newBalance : newBalance as int,
        message: freezed == message ? _value.message : message as String?,
      ) as $Val);
}

abstract class _$$GiftResultImplCopyWith<$Res>
    implements $GiftResultCopyWith<$Res> {
  factory _$$GiftResultImplCopyWith(
          _$GiftResultImpl value, $Res Function(_$GiftResultImpl) then) =
      __$$GiftResultImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({bool success, int newBalance, String? message});
}

class __$$GiftResultImplCopyWithImpl<$Res>
    extends _$GiftResultCopyWithImpl<$Res, _$GiftResultImpl>
    implements _$$GiftResultImplCopyWith<$Res> {
  __$$GiftResultImplCopyWithImpl(
      _$GiftResultImpl _value, $Res Function(_$GiftResultImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? success = null,
    Object? newBalance = null,
    Object? message = freezed,
  }) =>
      _then(_$GiftResultImpl(
        success: null == success ? _value.success : success as bool,
        newBalance: null == newBalance ? _value.newBalance : newBalance as int,
        message: freezed == message ? _value.message : message as String?,
      ));
}

@JsonSerializable()
class _$GiftResultImpl implements _GiftResult {
  const _$GiftResultImpl({
    required this.success,
    required this.newBalance,
    this.message,
  });

  factory _$GiftResultImpl.fromJson(Map<String, dynamic> json) =>
      _$$GiftResultImplFromJson(json);

  @override
  final bool success;
  @override
  final int newBalance;
  @override
  final String? message;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other.runtimeType == runtimeType &&
          other is _$GiftResultImpl &&
          other.success == success &&
          other.newBalance == newBalance);

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(runtimeType, success, newBalance);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$GiftResultImplCopyWith<_$GiftResultImpl> get copyWith =>
      __$$GiftResultImplCopyWithImpl<_$GiftResultImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() => _$$GiftResultImplToJson(this);
}

abstract class _GiftResult implements GiftResult {
  const factory _GiftResult({
    required final bool success,
    required final int newBalance,
    final String? message,
  }) = _$GiftResultImpl;

  factory _GiftResult.fromJson(Map<String, dynamic> json) =
      _$GiftResultImpl.fromJson;

  @override
  bool get success;
  @override
  int get newBalance;
  @override
  String? get message;
  @override
  @JsonKey(ignore: true)
  _$$GiftResultImplCopyWith<_$GiftResultImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

// ConfirmResult ---------------------------------------------------------------

ConfirmResult _$ConfirmResultFromJson(Map<String, dynamic> json) =>
    _ConfirmResult.fromJson(json);

mixin _$ConfirmResult {
  bool get success => throw _privateConstructorUsedError;
  SocialRelation? get relation => throw _privateConstructorUsedError;
  String? get message => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $ConfirmResultCopyWith<ConfirmResult> get copyWith =>
      throw _privateConstructorUsedError;
}

abstract class $ConfirmResultCopyWith<$Res> {
  factory $ConfirmResultCopyWith(
          ConfirmResult value, $Res Function(ConfirmResult) then) =
      _$ConfirmResultCopyWithImpl<$Res, ConfirmResult>;
  @useResult
  $Res call({bool success, SocialRelation? relation, String? message});
}

class _$ConfirmResultCopyWithImpl<$Res, $Val extends ConfirmResult>
    implements $ConfirmResultCopyWith<$Res> {
  _$ConfirmResultCopyWithImpl(this._value, this._then);
  final $Val _value;
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? success = null,
    Object? relation = freezed,
    Object? message = freezed,
  }) =>
      _then(_value.copyWith(
        success: null == success ? _value.success : success as bool,
        relation:
            freezed == relation ? _value.relation : relation as SocialRelation?,
        message: freezed == message ? _value.message : message as String?,
      ) as $Val);
}

abstract class _$$ConfirmResultImplCopyWith<$Res>
    implements $ConfirmResultCopyWith<$Res> {
  factory _$$ConfirmResultImplCopyWith(
          _$ConfirmResultImpl value, $Res Function(_$ConfirmResultImpl) then) =
      __$$ConfirmResultImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({bool success, SocialRelation? relation, String? message});
}

class __$$ConfirmResultImplCopyWithImpl<$Res>
    extends _$ConfirmResultCopyWithImpl<$Res, _$ConfirmResultImpl>
    implements _$$ConfirmResultImplCopyWith<$Res> {
  __$$ConfirmResultImplCopyWithImpl(
      _$ConfirmResultImpl _value, $Res Function(_$ConfirmResultImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? success = null,
    Object? relation = freezed,
    Object? message = freezed,
  }) =>
      _then(_$ConfirmResultImpl(
        success: null == success ? _value.success : success as bool,
        relation:
            freezed == relation ? _value.relation : relation as SocialRelation?,
        message: freezed == message ? _value.message : message as String?,
      ));
}

@JsonSerializable()
class _$ConfirmResultImpl implements _ConfirmResult {
  const _$ConfirmResultImpl({
    required this.success,
    this.relation,
    this.message,
  });

  factory _$ConfirmResultImpl.fromJson(Map<String, dynamic> json) =>
      _$$ConfirmResultImplFromJson(json);

  @override
  final bool success;
  @override
  final SocialRelation? relation;
  @override
  final String? message;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other.runtimeType == runtimeType &&
          other is _$ConfirmResultImpl &&
          other.success == success);

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(runtimeType, success, relation, message);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$ConfirmResultImplCopyWith<_$ConfirmResultImpl> get copyWith =>
      __$$ConfirmResultImplCopyWithImpl<_$ConfirmResultImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() => _$$ConfirmResultImplToJson(this);
}

abstract class _ConfirmResult implements ConfirmResult {
  const factory _ConfirmResult({
    required final bool success,
    final SocialRelation? relation,
    final String? message,
  }) = _$ConfirmResultImpl;

  factory _ConfirmResult.fromJson(Map<String, dynamic> json) =
      _$ConfirmResultImpl.fromJson;

  @override
  bool get success;
  @override
  SocialRelation? get relation;
  @override
  String? get message;
  @override
  @JsonKey(ignore: true)
  _$$ConfirmResultImplCopyWith<_$ConfirmResultImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

// GroupEffect -----------------------------------------------------------------

GroupEffect _$GroupEffectFromJson(Map<String, dynamic> json) =>
    _GroupEffect.fromJson(json);

mixin _$GroupEffect {
  String get id => throw _privateConstructorUsedError;
  String get geoHash => throw _privateConstructorUsedError;
  String get effectType => throw _privateConstructorUsedError;
  double get magnitude => throw _privateConstructorUsedError;
  int get participantCount => throw _privateConstructorUsedError;
  String? get description => throw _privateConstructorUsedError;
  String? get expiresAt => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $GroupEffectCopyWith<GroupEffect> get copyWith =>
      throw _privateConstructorUsedError;
}

abstract class $GroupEffectCopyWith<$Res> {
  factory $GroupEffectCopyWith(
          GroupEffect value, $Res Function(GroupEffect) then) =
      _$GroupEffectCopyWithImpl<$Res, GroupEffect>;
  @useResult
  $Res call({
    String id,
    String geoHash,
    String effectType,
    double magnitude,
    int participantCount,
    String? description,
    String? expiresAt,
  });
}

class _$GroupEffectCopyWithImpl<$Res, $Val extends GroupEffect>
    implements $GroupEffectCopyWith<$Res> {
  _$GroupEffectCopyWithImpl(this._value, this._then);
  final $Val _value;
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? geoHash = null,
    Object? effectType = null,
    Object? magnitude = null,
    Object? participantCount = null,
    Object? description = freezed,
    Object? expiresAt = freezed,
  }) =>
      _then(_value.copyWith(
        id: null == id ? _value.id : id as String,
        geoHash: null == geoHash ? _value.geoHash : geoHash as String,
        effectType: null == effectType ? _value.effectType : effectType as String,
        magnitude: null == magnitude ? _value.magnitude : magnitude as double,
        participantCount: null == participantCount
            ? _value.participantCount
            : participantCount as int,
        description:
            freezed == description ? _value.description : description as String?,
        expiresAt:
            freezed == expiresAt ? _value.expiresAt : expiresAt as String?,
      ) as $Val);
}

abstract class _$$GroupEffectImplCopyWith<$Res>
    implements $GroupEffectCopyWith<$Res> {
  factory _$$GroupEffectImplCopyWith(
          _$GroupEffectImpl value, $Res Function(_$GroupEffectImpl) then) =
      __$$GroupEffectImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    String id,
    String geoHash,
    String effectType,
    double magnitude,
    int participantCount,
    String? description,
    String? expiresAt,
  });
}

class __$$GroupEffectImplCopyWithImpl<$Res>
    extends _$GroupEffectCopyWithImpl<$Res, _$GroupEffectImpl>
    implements _$$GroupEffectImplCopyWith<$Res> {
  __$$GroupEffectImplCopyWithImpl(
      _$GroupEffectImpl _value, $Res Function(_$GroupEffectImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? geoHash = null,
    Object? effectType = null,
    Object? magnitude = null,
    Object? participantCount = null,
    Object? description = freezed,
    Object? expiresAt = freezed,
  }) =>
      _then(_$GroupEffectImpl(
        id: null == id ? _value.id : id as String,
        geoHash: null == geoHash ? _value.geoHash : geoHash as String,
        effectType: null == effectType ? _value.effectType : effectType as String,
        magnitude: null == magnitude ? _value.magnitude : magnitude as double,
        participantCount: null == participantCount
            ? _value.participantCount
            : participantCount as int,
        description:
            freezed == description ? _value.description : description as String?,
        expiresAt:
            freezed == expiresAt ? _value.expiresAt : expiresAt as String?,
      ));
}

@JsonSerializable()
class _$GroupEffectImpl implements _GroupEffect {
  const _$GroupEffectImpl({
    required this.id,
    required this.geoHash,
    required this.effectType,
    required this.magnitude,
    required this.participantCount,
    this.description,
    this.expiresAt,
  });

  factory _$GroupEffectImpl.fromJson(Map<String, dynamic> json) =>
      _$$GroupEffectImplFromJson(json);

  @override
  final String id;
  @override
  final String geoHash;
  @override
  final String effectType;
  @override
  final double magnitude;
  @override
  final int participantCount;
  @override
  final String? description;
  @override
  final String? expiresAt;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other.runtimeType == runtimeType &&
          other is _$GroupEffectImpl &&
          other.id == id);

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(runtimeType, id);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$GroupEffectImplCopyWith<_$GroupEffectImpl> get copyWith =>
      __$$GroupEffectImplCopyWithImpl<_$GroupEffectImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() => _$$GroupEffectImplToJson(this);
}

abstract class _GroupEffect implements GroupEffect {
  const factory _GroupEffect({
    required final String id,
    required final String geoHash,
    required final String effectType,
    required final double magnitude,
    required final int participantCount,
    final String? description,
    final String? expiresAt,
  }) = _$GroupEffectImpl;

  factory _GroupEffect.fromJson(Map<String, dynamic> json) =
      _$GroupEffectImpl.fromJson;

  @override
  String get id;
  @override
  String get geoHash;
  @override
  String get effectType;
  @override
  double get magnitude;
  @override
  int get participantCount;
  @override
  String? get description;
  @override
  String? get expiresAt;
  @override
  @JsonKey(ignore: true)
  _$$GroupEffectImplCopyWith<_$GroupEffectImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

// ignore: unused_element
const freezed = Object();
