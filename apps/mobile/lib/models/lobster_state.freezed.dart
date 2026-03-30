// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'lobster_state.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

LobsterState _$LobsterStateFromJson(Map<String, dynamic> json) {
  return _LobsterState.fromJson(json);
}

/// @nodoc
mixin _$LobsterState {
  String get id => throw _privateConstructorUsedError;
  String get name => throw _privateConstructorUsedError;
  String get ownerId => throw _privateConstructorUsedError;
  EmotionState get emotion => throw _privateConstructorUsedError;
  PersonalityDna get personality => throw _privateConstructorUsedError;
  int get energy => throw _privateConstructorUsedError;
  int get happiness => throw _privateConstructorUsedError;
  int get chillScore => throw _privateConstructorUsedError;
  int get shellBalance => throw _privateConstructorUsedError;
  int get xp => throw _privateConstructorUsedError;
  int get level => throw _privateConstructorUsedError;
  String get updatedAt => throw _privateConstructorUsedError;
  String get createdAt => throw _privateConstructorUsedError;
  String? get currentSceneId => throw _privateConstructorUsedError;
  String? get avatarUrl => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $LobsterStateCopyWith<LobsterState> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $LobsterStateCopyWith<$Res> {
  factory $LobsterStateCopyWith(
          LobsterState value, $Res Function(LobsterState) then) =
      _$LobsterStateCopyWithImpl<$Res, LobsterState>;
  @useResult
  $Res call({
    String id,
    String name,
    String ownerId,
    EmotionState emotion,
    PersonalityDna personality,
    int energy,
    int happiness,
    int chillScore,
    int shellBalance,
    int xp,
    int level,
    String updatedAt,
    String createdAt,
    String? currentSceneId,
    String? avatarUrl,
  });

  $EmotionStateCopyWith<$Res> get emotion;
  $PersonalityDnaCopyWith<$Res> get personality;
}

/// @nodoc
class _$LobsterStateCopyWithImpl<$Res, $Val extends LobsterState>
    implements $LobsterStateCopyWith<$Res> {
  _$LobsterStateCopyWithImpl(this._value, this._then);

  final $Val _value;
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? ownerId = null,
    Object? emotion = null,
    Object? personality = null,
    Object? energy = null,
    Object? happiness = null,
    Object? chillScore = null,
    Object? shellBalance = null,
    Object? xp = null,
    Object? level = null,
    Object? updatedAt = null,
    Object? createdAt = null,
    Object? currentSceneId = freezed,
    Object? avatarUrl = freezed,
  }) =>
      _then(_value.copyWith(
        id: null == id ? _value.id : id as String,
        name: null == name ? _value.name : name as String,
        ownerId: null == ownerId ? _value.ownerId : ownerId as String,
        emotion: null == emotion ? _value.emotion : emotion as EmotionState,
        personality: null == personality
            ? _value.personality
            : personality as PersonalityDna,
        energy: null == energy ? _value.energy : energy as int,
        happiness: null == happiness ? _value.happiness : happiness as int,
        chillScore: null == chillScore ? _value.chillScore : chillScore as int,
        shellBalance:
            null == shellBalance ? _value.shellBalance : shellBalance as int,
        xp: null == xp ? _value.xp : xp as int,
        level: null == level ? _value.level : level as int,
        updatedAt: null == updatedAt ? _value.updatedAt : updatedAt as String,
        createdAt: null == createdAt ? _value.createdAt : createdAt as String,
        currentSceneId: freezed == currentSceneId
            ? _value.currentSceneId
            : currentSceneId as String?,
        avatarUrl:
            freezed == avatarUrl ? _value.avatarUrl : avatarUrl as String?,
      ) as $Val);

  @override
  @pragma('vm:prefer-inline')
  $EmotionStateCopyWith<$Res> get emotion {
    return $EmotionStateCopyWith<$Res>(_value.emotion, (value) {
      return _then(_value.copyWith(emotion: value) as $Val);
    });
  }

  @override
  @pragma('vm:prefer-inline')
  $PersonalityDnaCopyWith<$Res> get personality {
    return $PersonalityDnaCopyWith<$Res>(_value.personality, (value) {
      return _then(_value.copyWith(personality: value) as $Val);
    });
  }
}

/// @nodoc
abstract class _$$LobsterStateImplCopyWith<$Res>
    implements $LobsterStateCopyWith<$Res> {
  factory _$$LobsterStateImplCopyWith(
          _$LobsterStateImpl value, $Res Function(_$LobsterStateImpl) then) =
      __$$LobsterStateImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    String id,
    String name,
    String ownerId,
    EmotionState emotion,
    PersonalityDna personality,
    int energy,
    int happiness,
    int chillScore,
    int shellBalance,
    int xp,
    int level,
    String updatedAt,
    String createdAt,
    String? currentSceneId,
    String? avatarUrl,
  });

  @override
  $EmotionStateCopyWith<$Res> get emotion;
  @override
  $PersonalityDnaCopyWith<$Res> get personality;
}

/// @nodoc
class __$$LobsterStateImplCopyWithImpl<$Res>
    extends _$LobsterStateCopyWithImpl<$Res, _$LobsterStateImpl>
    implements _$$LobsterStateImplCopyWith<$Res> {
  __$$LobsterStateImplCopyWithImpl(
      _$LobsterStateImpl _value, $Res Function(_$LobsterStateImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? ownerId = null,
    Object? emotion = null,
    Object? personality = null,
    Object? energy = null,
    Object? happiness = null,
    Object? chillScore = null,
    Object? shellBalance = null,
    Object? xp = null,
    Object? level = null,
    Object? updatedAt = null,
    Object? createdAt = null,
    Object? currentSceneId = freezed,
    Object? avatarUrl = freezed,
  }) =>
      _then(_$LobsterStateImpl(
        id: null == id ? _value.id : id as String,
        name: null == name ? _value.name : name as String,
        ownerId: null == ownerId ? _value.ownerId : ownerId as String,
        emotion: null == emotion ? _value.emotion : emotion as EmotionState,
        personality: null == personality
            ? _value.personality
            : personality as PersonalityDna,
        energy: null == energy ? _value.energy : energy as int,
        happiness: null == happiness ? _value.happiness : happiness as int,
        chillScore: null == chillScore ? _value.chillScore : chillScore as int,
        shellBalance:
            null == shellBalance ? _value.shellBalance : shellBalance as int,
        xp: null == xp ? _value.xp : xp as int,
        level: null == level ? _value.level : level as int,
        updatedAt: null == updatedAt ? _value.updatedAt : updatedAt as String,
        createdAt: null == createdAt ? _value.createdAt : createdAt as String,
        currentSceneId: freezed == currentSceneId
            ? _value.currentSceneId
            : currentSceneId as String?,
        avatarUrl:
            freezed == avatarUrl ? _value.avatarUrl : avatarUrl as String?,
      ));
}

/// @nodoc
@JsonSerializable()
class _$LobsterStateImpl implements _LobsterState {
  const _$LobsterStateImpl({
    required this.id,
    required this.name,
    required this.ownerId,
    required this.emotion,
    required this.personality,
    this.energy = 100,
    this.happiness = 50,
    this.chillScore = 50,
    this.shellBalance = 0,
    this.xp = 0,
    this.level = 1,
    required this.updatedAt,
    required this.createdAt,
    this.currentSceneId,
    this.avatarUrl,
  });

  factory _$LobsterStateImpl.fromJson(Map<String, dynamic> json) =>
      _$$LobsterStateImplFromJson(json);

  @override
  final String id;
  @override
  final String name;
  @override
  final String ownerId;
  @override
  final EmotionState emotion;
  @override
  final PersonalityDna personality;
  @override
  @JsonKey()
  final int energy;
  @override
  @JsonKey()
  final int happiness;
  @override
  @JsonKey()
  final int chillScore;
  @override
  @JsonKey()
  final int shellBalance;
  @override
  @JsonKey()
  final int xp;
  @override
  @JsonKey()
  final int level;
  @override
  final String updatedAt;
  @override
  final String createdAt;
  @override
  final String? currentSceneId;
  @override
  final String? avatarUrl;

  @override
  String toString() {
    return 'LobsterState(id: $id, name: $name, ownerId: $ownerId, emotion: $emotion, personality: $personality, energy: $energy, happiness: $happiness, chillScore: $chillScore, shellBalance: $shellBalance, xp: $xp, level: $level, updatedAt: $updatedAt, createdAt: $createdAt, currentSceneId: $currentSceneId, avatarUrl: $avatarUrl)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$LobsterStateImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.ownerId, ownerId) || other.ownerId == ownerId) &&
            (identical(other.emotion, emotion) || other.emotion == emotion) &&
            (identical(other.personality, personality) ||
                other.personality == personality) &&
            (identical(other.energy, energy) || other.energy == energy) &&
            (identical(other.happiness, happiness) ||
                other.happiness == happiness) &&
            (identical(other.chillScore, chillScore) ||
                other.chillScore == chillScore) &&
            (identical(other.shellBalance, shellBalance) ||
                other.shellBalance == shellBalance) &&
            (identical(other.xp, xp) || other.xp == xp) &&
            (identical(other.level, level) || other.level == level) &&
            (identical(other.updatedAt, updatedAt) ||
                other.updatedAt == updatedAt) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.currentSceneId, currentSceneId) ||
                other.currentSceneId == currentSceneId) &&
            (identical(other.avatarUrl, avatarUrl) ||
                other.avatarUrl == avatarUrl));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(
      runtimeType,
      id,
      name,
      ownerId,
      emotion,
      personality,
      energy,
      happiness,
      chillScore,
      shellBalance,
      xp,
      level,
      updatedAt,
      createdAt,
      currentSceneId,
      avatarUrl);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$LobsterStateImplCopyWith<_$LobsterStateImpl> get copyWith =>
      __$$LobsterStateImplCopyWithImpl<_$LobsterStateImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$LobsterStateImplToJson(this);
  }
}

abstract class _LobsterState implements LobsterState {
  const factory _LobsterState({
    required final String id,
    required final String name,
    required final String ownerId,
    required final EmotionState emotion,
    required final PersonalityDna personality,
    final int energy,
    final int happiness,
    final int chillScore,
    final int shellBalance,
    final int xp,
    final int level,
    required final String updatedAt,
    required final String createdAt,
    final String? currentSceneId,
    final String? avatarUrl,
  }) = _$LobsterStateImpl;

  factory _LobsterState.fromJson(Map<String, dynamic> json) =
      _$LobsterStateImpl.fromJson;

  @override
  String get id;
  @override
  String get name;
  @override
  String get ownerId;
  @override
  EmotionState get emotion;
  @override
  PersonalityDna get personality;
  @override
  int get energy;
  @override
  int get happiness;
  @override
  int get chillScore;
  @override
  int get shellBalance;
  @override
  int get xp;
  @override
  int get level;
  @override
  String get updatedAt;
  @override
  String get createdAt;
  @override
  String? get currentSceneId;
  @override
  String? get avatarUrl;
  @override
  @JsonKey(ignore: true)
  _$$LobsterStateImplCopyWith<_$LobsterStateImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

// ignore: unused_element
const freezed = Object();
