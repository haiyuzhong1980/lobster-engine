// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'emotion_state.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

EmotionState _$EmotionStateFromJson(Map<String, dynamic> json) {
  return _EmotionState.fromJson(json);
}

/// @nodoc
mixin _$EmotionState {
  EmotionType get type => throw _privateConstructorUsedError;
  double get intensity => throw _privateConstructorUsedError;
  String? get description => throw _privateConstructorUsedError;
  String? get trigger => throw _privateConstructorUsedError;
  String get activatedAt => throw _privateConstructorUsedError;
  String? get expiresAt => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $EmotionStateCopyWith<EmotionState> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $EmotionStateCopyWith<$Res> {
  factory $EmotionStateCopyWith(
          EmotionState value, $Res Function(EmotionState) then) =
      _$EmotionStateCopyWithImpl<$Res, EmotionState>;
  @useResult
  $Res call({
    EmotionType type,
    double intensity,
    String? description,
    String? trigger,
    String activatedAt,
    String? expiresAt,
  });
}

/// @nodoc
class _$EmotionStateCopyWithImpl<$Res, $Val extends EmotionState>
    implements $EmotionStateCopyWith<$Res> {
  _$EmotionStateCopyWithImpl(this._value, this._then);

  final $Val _value;
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? type = null,
    Object? intensity = null,
    Object? description = freezed,
    Object? trigger = freezed,
    Object? activatedAt = null,
    Object? expiresAt = freezed,
  }) =>
      _then(_value.copyWith(
        type: null == type
            ? _value.type
            : type as EmotionType,
        intensity: null == intensity
            ? _value.intensity
            : intensity as double,
        description: freezed == description
            ? _value.description
            : description as String?,
        trigger: freezed == trigger
            ? _value.trigger
            : trigger as String?,
        activatedAt: null == activatedAt
            ? _value.activatedAt
            : activatedAt as String,
        expiresAt: freezed == expiresAt
            ? _value.expiresAt
            : expiresAt as String?,
      ) as $Val);
}

/// @nodoc
abstract class _$$EmotionStateImplCopyWith<$Res>
    implements $EmotionStateCopyWith<$Res> {
  factory _$$EmotionStateImplCopyWith(
          _$EmotionStateImpl value, $Res Function(_$EmotionStateImpl) then) =
      __$$EmotionStateImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    EmotionType type,
    double intensity,
    String? description,
    String? trigger,
    String activatedAt,
    String? expiresAt,
  });
}

/// @nodoc
class __$$EmotionStateImplCopyWithImpl<$Res>
    extends _$EmotionStateCopyWithImpl<$Res, _$EmotionStateImpl>
    implements _$$EmotionStateImplCopyWith<$Res> {
  __$$EmotionStateImplCopyWithImpl(
      _$EmotionStateImpl _value, $Res Function(_$EmotionStateImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? type = null,
    Object? intensity = null,
    Object? description = freezed,
    Object? trigger = freezed,
    Object? activatedAt = null,
    Object? expiresAt = freezed,
  }) =>
      _then(_$EmotionStateImpl(
        type: null == type ? _value.type : type as EmotionType,
        intensity: null == intensity ? _value.intensity : intensity as double,
        description:
            freezed == description ? _value.description : description as String?,
        trigger: freezed == trigger ? _value.trigger : trigger as String?,
        activatedAt:
            null == activatedAt ? _value.activatedAt : activatedAt as String,
        expiresAt:
            freezed == expiresAt ? _value.expiresAt : expiresAt as String?,
      ));
}

/// @nodoc
@JsonSerializable()
class _$EmotionStateImpl implements _EmotionState {
  const _$EmotionStateImpl({
    required this.type,
    this.intensity = 0.5,
    this.description,
    this.trigger,
    required this.activatedAt,
    this.expiresAt,
  });

  factory _$EmotionStateImpl.fromJson(Map<String, dynamic> json) =>
      _$$EmotionStateImplFromJson(json);

  @override
  final EmotionType type;
  @override
  @JsonKey()
  final double intensity;
  @override
  final String? description;
  @override
  final String? trigger;
  @override
  final String activatedAt;
  @override
  final String? expiresAt;

  @override
  String toString() {
    return 'EmotionState(type: $type, intensity: $intensity, description: $description, trigger: $trigger, activatedAt: $activatedAt, expiresAt: $expiresAt)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$EmotionStateImpl &&
            (identical(other.type, type) || other.type == type) &&
            (identical(other.intensity, intensity) ||
                other.intensity == intensity) &&
            (identical(other.description, description) ||
                other.description == description) &&
            (identical(other.trigger, trigger) || other.trigger == trigger) &&
            (identical(other.activatedAt, activatedAt) ||
                other.activatedAt == activatedAt) &&
            (identical(other.expiresAt, expiresAt) ||
                other.expiresAt == expiresAt));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(
      runtimeType, type, intensity, description, trigger, activatedAt, expiresAt);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$EmotionStateImplCopyWith<_$EmotionStateImpl> get copyWith =>
      __$$EmotionStateImplCopyWithImpl<_$EmotionStateImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$EmotionStateImplToJson(
      this,
    );
  }
}

abstract class _EmotionState implements EmotionState {
  const factory _EmotionState({
    required final EmotionType type,
    final double intensity,
    final String? description,
    final String? trigger,
    required final String activatedAt,
    final String? expiresAt,
  }) = _$EmotionStateImpl;

  factory _EmotionState.fromJson(Map<String, dynamic> json) =
      _$EmotionStateImpl.fromJson;

  @override
  EmotionType get type;
  @override
  double get intensity;
  @override
  String? get description;
  @override
  String? get trigger;
  @override
  String get activatedAt;
  @override
  String? get expiresAt;
  @override
  @JsonKey(ignore: true)
  _$$EmotionStateImplCopyWith<_$EmotionStateImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

// ignore: unused_element
const freezed = Object();
