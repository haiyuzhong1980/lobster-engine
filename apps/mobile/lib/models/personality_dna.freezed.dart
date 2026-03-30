// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'personality_dna.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

PersonalityTrait _$PersonalityTraitFromJson(Map<String, dynamic> json) {
  return _PersonalityTrait.fromJson(json);
}

/// @nodoc
mixin _$PersonalityTrait {
  String get key => throw _privateConstructorUsedError;
  String get label => throw _privateConstructorUsedError;
  double get value => throw _privateConstructorUsedError;
  double get plasticity => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $PersonalityTraitCopyWith<PersonalityTrait> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $PersonalityTraitCopyWith<$Res> {
  factory $PersonalityTraitCopyWith(
          PersonalityTrait value, $Res Function(PersonalityTrait) then) =
      _$PersonalityTraitCopyWithImpl<$Res, PersonalityTrait>;
  @useResult
  $Res call({String key, String label, double value, double plasticity});
}

/// @nodoc
class _$PersonalityTraitCopyWithImpl<$Res, $Val extends PersonalityTrait>
    implements $PersonalityTraitCopyWith<$Res> {
  _$PersonalityTraitCopyWithImpl(this._value, this._then);

  final $Val _value;
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? key = null,
    Object? label = null,
    Object? value = null,
    Object? plasticity = null,
  }) =>
      _then(_value.copyWith(
        key: null == key ? _value.key : key as String,
        label: null == label ? _value.label : label as String,
        value: null == value ? _value.value : value as double,
        plasticity: null == plasticity ? _value.plasticity : plasticity as double,
      ) as $Val);
}

/// @nodoc
abstract class _$$PersonalityTraitImplCopyWith<$Res>
    implements $PersonalityTraitCopyWith<$Res> {
  factory _$$PersonalityTraitImplCopyWith(_$PersonalityTraitImpl value,
          $Res Function(_$PersonalityTraitImpl) then) =
      __$$PersonalityTraitImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({String key, String label, double value, double plasticity});
}

/// @nodoc
class __$$PersonalityTraitImplCopyWithImpl<$Res>
    extends _$PersonalityTraitCopyWithImpl<$Res, _$PersonalityTraitImpl>
    implements _$$PersonalityTraitImplCopyWith<$Res> {
  __$$PersonalityTraitImplCopyWithImpl(_$PersonalityTraitImpl _value,
      $Res Function(_$PersonalityTraitImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? key = null,
    Object? label = null,
    Object? value = null,
    Object? plasticity = null,
  }) =>
      _then(_$PersonalityTraitImpl(
        key: null == key ? _value.key : key as String,
        label: null == label ? _value.label : label as String,
        value: null == value ? _value.value : value as double,
        plasticity: null == plasticity ? _value.plasticity : plasticity as double,
      ));
}

/// @nodoc
@JsonSerializable()
class _$PersonalityTraitImpl implements _PersonalityTrait {
  const _$PersonalityTraitImpl({
    required this.key,
    required this.label,
    required this.value,
    this.plasticity = 0.1,
  });

  factory _$PersonalityTraitImpl.fromJson(Map<String, dynamic> json) =>
      _$$PersonalityTraitImplFromJson(json);

  @override
  final String key;
  @override
  final String label;
  @override
  final double value;
  @override
  @JsonKey()
  final double plasticity;

  @override
  String toString() =>
      'PersonalityTrait(key: $key, label: $label, value: $value, plasticity: $plasticity)';

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$PersonalityTraitImpl &&
            (identical(other.key, key) || other.key == key) &&
            (identical(other.label, label) || other.label == label) &&
            (identical(other.value, value) || other.value == value) &&
            (identical(other.plasticity, plasticity) ||
                other.plasticity == plasticity));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(runtimeType, key, label, value, plasticity);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$PersonalityTraitImplCopyWith<_$PersonalityTraitImpl> get copyWith =>
      __$$PersonalityTraitImplCopyWithImpl<_$PersonalityTraitImpl>(
          this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$PersonalityTraitImplToJson(this);
  }
}

abstract class _PersonalityTrait implements PersonalityTrait {
  const factory _PersonalityTrait({
    required final String key,
    required final String label,
    required final double value,
    final double plasticity,
  }) = _$PersonalityTraitImpl;

  factory _PersonalityTrait.fromJson(Map<String, dynamic> json) =
      _$PersonalityTraitImpl.fromJson;

  @override
  String get key;
  @override
  String get label;
  @override
  double get value;
  @override
  double get plasticity;
  @override
  @JsonKey(ignore: true)
  _$$PersonalityTraitImplCopyWith<_$PersonalityTraitImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

// PersonalityDna ---------------------------------------------------------------

PersonalityDna _$PersonalityDnaFromJson(Map<String, dynamic> json) {
  return _PersonalityDna.fromJson(json);
}

/// @nodoc
mixin _$PersonalityDna {
  PersonalityArchetype get archetype => throw _privateConstructorUsedError;
  List<PersonalityTrait> get traits => throw _privateConstructorUsedError;
  String? get narrative => throw _privateConstructorUsedError;
  String? get lastEvolvedAt => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $PersonalityDnaCopyWith<PersonalityDna> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $PersonalityDnaCopyWith<$Res> {
  factory $PersonalityDnaCopyWith(
          PersonalityDna value, $Res Function(PersonalityDna) then) =
      _$PersonalityDnaCopyWithImpl<$Res, PersonalityDna>;
  @useResult
  $Res call({
    PersonalityArchetype archetype,
    List<PersonalityTrait> traits,
    String? narrative,
    String? lastEvolvedAt,
  });
}

/// @nodoc
class _$PersonalityDnaCopyWithImpl<$Res, $Val extends PersonalityDna>
    implements $PersonalityDnaCopyWith<$Res> {
  _$PersonalityDnaCopyWithImpl(this._value, this._then);

  final $Val _value;
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? archetype = null,
    Object? traits = null,
    Object? narrative = freezed,
    Object? lastEvolvedAt = freezed,
  }) =>
      _then(_value.copyWith(
        archetype: null == archetype
            ? _value.archetype
            : archetype as PersonalityArchetype,
        traits: null == traits ? _value.traits : traits as List<PersonalityTrait>,
        narrative: freezed == narrative ? _value.narrative : narrative as String?,
        lastEvolvedAt: freezed == lastEvolvedAt
            ? _value.lastEvolvedAt
            : lastEvolvedAt as String?,
      ) as $Val);
}

/// @nodoc
abstract class _$$PersonalityDnaImplCopyWith<$Res>
    implements $PersonalityDnaCopyWith<$Res> {
  factory _$$PersonalityDnaImplCopyWith(_$PersonalityDnaImpl value,
          $Res Function(_$PersonalityDnaImpl) then) =
      __$$PersonalityDnaImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    PersonalityArchetype archetype,
    List<PersonalityTrait> traits,
    String? narrative,
    String? lastEvolvedAt,
  });
}

/// @nodoc
class __$$PersonalityDnaImplCopyWithImpl<$Res>
    extends _$PersonalityDnaCopyWithImpl<$Res, _$PersonalityDnaImpl>
    implements _$$PersonalityDnaImplCopyWith<$Res> {
  __$$PersonalityDnaImplCopyWithImpl(
      _$PersonalityDnaImpl _value, $Res Function(_$PersonalityDnaImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? archetype = null,
    Object? traits = null,
    Object? narrative = freezed,
    Object? lastEvolvedAt = freezed,
  }) =>
      _then(_$PersonalityDnaImpl(
        archetype: null == archetype
            ? _value.archetype
            : archetype as PersonalityArchetype,
        traits: null == traits
            ? _value._traits
            : traits as List<PersonalityTrait>,
        narrative: freezed == narrative ? _value.narrative : narrative as String?,
        lastEvolvedAt: freezed == lastEvolvedAt
            ? _value.lastEvolvedAt
            : lastEvolvedAt as String?,
      ));
}

/// @nodoc
@JsonSerializable()
class _$PersonalityDnaImpl implements _PersonalityDna {
  const _$PersonalityDnaImpl({
    required this.archetype,
    required final List<PersonalityTrait> traits,
    this.narrative,
    this.lastEvolvedAt,
  }) : _traits = traits;

  factory _$PersonalityDnaImpl.fromJson(Map<String, dynamic> json) =>
      _$$PersonalityDnaImplFromJson(json);

  @override
  final PersonalityArchetype archetype;
  final List<PersonalityTrait> _traits;
  @override
  List<PersonalityTrait> get traits {
    if (_traits is EqualUnmodifiableListView) return _traits;
    return EqualUnmodifiableListView(_traits);
  }

  @override
  final String? narrative;
  @override
  final String? lastEvolvedAt;

  @override
  String toString() =>
      'PersonalityDna(archetype: $archetype, traits: $traits, narrative: $narrative, lastEvolvedAt: $lastEvolvedAt)';

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$PersonalityDnaImpl &&
            (identical(other.archetype, archetype) ||
                other.archetype == archetype) &&
            const DeepCollectionEquality().equals(other._traits, _traits) &&
            (identical(other.narrative, narrative) ||
                other.narrative == narrative) &&
            (identical(other.lastEvolvedAt, lastEvolvedAt) ||
                other.lastEvolvedAt == lastEvolvedAt));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(
      runtimeType,
      archetype,
      const DeepCollectionEquality().hash(_traits),
      narrative,
      lastEvolvedAt);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$PersonalityDnaImplCopyWith<_$PersonalityDnaImpl> get copyWith =>
      __$$PersonalityDnaImplCopyWithImpl<_$PersonalityDnaImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$PersonalityDnaImplToJson(this);
  }
}

abstract class _PersonalityDna implements PersonalityDna {
  const factory _PersonalityDna({
    required final PersonalityArchetype archetype,
    required final List<PersonalityTrait> traits,
    final String? narrative,
    final String? lastEvolvedAt,
  }) = _$PersonalityDnaImpl;

  factory _PersonalityDna.fromJson(Map<String, dynamic> json) =
      _$PersonalityDnaImpl.fromJson;

  @override
  PersonalityArchetype get archetype;
  @override
  List<PersonalityTrait> get traits;
  @override
  String? get narrative;
  @override
  String? get lastEvolvedAt;
  @override
  @JsonKey(ignore: true)
  _$$PersonalityDnaImplCopyWith<_$PersonalityDnaImpl> get copyWith =>
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
