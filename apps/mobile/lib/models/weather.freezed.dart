// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'weather.dart';

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

WeatherLobsterEffect _$WeatherLobsterEffectFromJson(
        Map<String, dynamic> json) =>
    _WeatherLobsterEffect.fromJson(json);

mixin _$WeatherLobsterEffect {
  String get emotionBias => throw _privateConstructorUsedError;
  int get chillDelta => throw _privateConstructorUsedError;
  int get energyDelta => throw _privateConstructorUsedError;
  String? get narrative => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $WeatherLobsterEffectCopyWith<WeatherLobsterEffect> get copyWith =>
      throw _privateConstructorUsedError;
}

abstract class $WeatherLobsterEffectCopyWith<$Res> {
  factory $WeatherLobsterEffectCopyWith(WeatherLobsterEffect value,
          $Res Function(WeatherLobsterEffect) then) =
      _$WeatherLobsterEffectCopyWithImpl<$Res, WeatherLobsterEffect>;
  @useResult
  $Res call({String emotionBias, int chillDelta, int energyDelta, String? narrative});
}

class _$WeatherLobsterEffectCopyWithImpl<$Res,
        $Val extends WeatherLobsterEffect>
    implements $WeatherLobsterEffectCopyWith<$Res> {
  _$WeatherLobsterEffectCopyWithImpl(this._value, this._then);
  final $Val _value;
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? emotionBias = null,
    Object? chillDelta = null,
    Object? energyDelta = null,
    Object? narrative = freezed,
  }) =>
      _then(_value.copyWith(
        emotionBias:
            null == emotionBias ? _value.emotionBias : emotionBias as String,
        chillDelta: null == chillDelta ? _value.chillDelta : chillDelta as int,
        energyDelta:
            null == energyDelta ? _value.energyDelta : energyDelta as int,
        narrative: freezed == narrative ? _value.narrative : narrative as String?,
      ) as $Val);
}

abstract class _$$WeatherLobsterEffectImplCopyWith<$Res>
    implements $WeatherLobsterEffectCopyWith<$Res> {
  factory _$$WeatherLobsterEffectImplCopyWith(_$WeatherLobsterEffectImpl value,
          $Res Function(_$WeatherLobsterEffectImpl) then) =
      __$$WeatherLobsterEffectImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({String emotionBias, int chillDelta, int energyDelta, String? narrative});
}

class __$$WeatherLobsterEffectImplCopyWithImpl<$Res>
    extends _$WeatherLobsterEffectCopyWithImpl<$Res, _$WeatherLobsterEffectImpl>
    implements _$$WeatherLobsterEffectImplCopyWith<$Res> {
  __$$WeatherLobsterEffectImplCopyWithImpl(_$WeatherLobsterEffectImpl _value,
      $Res Function(_$WeatherLobsterEffectImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? emotionBias = null,
    Object? chillDelta = null,
    Object? energyDelta = null,
    Object? narrative = freezed,
  }) =>
      _then(_$WeatherLobsterEffectImpl(
        emotionBias:
            null == emotionBias ? _value.emotionBias : emotionBias as String,
        chillDelta: null == chillDelta ? _value.chillDelta : chillDelta as int,
        energyDelta:
            null == energyDelta ? _value.energyDelta : energyDelta as int,
        narrative: freezed == narrative ? _value.narrative : narrative as String?,
      ));
}

@JsonSerializable()
class _$WeatherLobsterEffectImpl implements _WeatherLobsterEffect {
  const _$WeatherLobsterEffectImpl({
    required this.emotionBias,
    this.chillDelta = 0,
    this.energyDelta = 0,
    this.narrative,
  });

  factory _$WeatherLobsterEffectImpl.fromJson(Map<String, dynamic> json) =>
      _$$WeatherLobsterEffectImplFromJson(json);

  @override
  final String emotionBias;
  @override
  @JsonKey()
  final int chillDelta;
  @override
  @JsonKey()
  final int energyDelta;
  @override
  final String? narrative;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other.runtimeType == runtimeType &&
          other is _$WeatherLobsterEffectImpl &&
          other.emotionBias == emotionBias &&
          other.chillDelta == chillDelta &&
          other.energyDelta == energyDelta &&
          other.narrative == narrative);

  @JsonKey(ignore: true)
  @override
  int get hashCode =>
      Object.hash(runtimeType, emotionBias, chillDelta, energyDelta, narrative);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$WeatherLobsterEffectImplCopyWith<_$WeatherLobsterEffectImpl>
      get copyWith =>
          __$$WeatherLobsterEffectImplCopyWithImpl<_$WeatherLobsterEffectImpl>(
              this, _$identity);

  @override
  Map<String, dynamic> toJson() => _$$WeatherLobsterEffectImplToJson(this);
}

abstract class _WeatherLobsterEffect implements WeatherLobsterEffect {
  const factory _WeatherLobsterEffect({
    required final String emotionBias,
    final int chillDelta,
    final int energyDelta,
    final String? narrative,
  }) = _$WeatherLobsterEffectImpl;

  factory _WeatherLobsterEffect.fromJson(Map<String, dynamic> json) =
      _$WeatherLobsterEffectImpl.fromJson;

  @override
  String get emotionBias;
  @override
  int get chillDelta;
  @override
  int get energyDelta;
  @override
  String? get narrative;
  @override
  @JsonKey(ignore: true)
  _$$WeatherLobsterEffectImplCopyWith<_$WeatherLobsterEffectImpl>
      get copyWith => throw _privateConstructorUsedError;
}

// WeatherResponse -------------------------------------------------------------

WeatherResponse _$WeatherResponseFromJson(Map<String, dynamic> json) =>
    _WeatherResponse.fromJson(json);

mixin _$WeatherResponse {
  String get location => throw _privateConstructorUsedError;
  WeatherCondition get condition => throw _privateConstructorUsedError;
  double get temperatureCelsius => throw _privateConstructorUsedError;
  int get humidity => throw _privateConstructorUsedError;
  double get windSpeedKmh => throw _privateConstructorUsedError;
  int get uvIndex => throw _privateConstructorUsedError;
  WeatherLobsterEffect get lobsterEffect => throw _privateConstructorUsedError;
  String get fetchedAt => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $WeatherResponseCopyWith<WeatherResponse> get copyWith =>
      throw _privateConstructorUsedError;
}

abstract class $WeatherResponseCopyWith<$Res> {
  factory $WeatherResponseCopyWith(
          WeatherResponse value, $Res Function(WeatherResponse) then) =
      _$WeatherResponseCopyWithImpl<$Res, WeatherResponse>;
  @useResult
  $Res call({
    String location,
    WeatherCondition condition,
    double temperatureCelsius,
    int humidity,
    double windSpeedKmh,
    int uvIndex,
    WeatherLobsterEffect lobsterEffect,
    String fetchedAt,
  });
}

class _$WeatherResponseCopyWithImpl<$Res, $Val extends WeatherResponse>
    implements $WeatherResponseCopyWith<$Res> {
  _$WeatherResponseCopyWithImpl(this._value, this._then);
  final $Val _value;
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? location = null,
    Object? condition = null,
    Object? temperatureCelsius = null,
    Object? humidity = null,
    Object? windSpeedKmh = null,
    Object? uvIndex = null,
    Object? lobsterEffect = null,
    Object? fetchedAt = null,
  }) =>
      _then(_value.copyWith(
        location: null == location ? _value.location : location as String,
        condition: null == condition
            ? _value.condition
            : condition as WeatherCondition,
        temperatureCelsius: null == temperatureCelsius
            ? _value.temperatureCelsius
            : temperatureCelsius as double,
        humidity: null == humidity ? _value.humidity : humidity as int,
        windSpeedKmh:
            null == windSpeedKmh ? _value.windSpeedKmh : windSpeedKmh as double,
        uvIndex: null == uvIndex ? _value.uvIndex : uvIndex as int,
        lobsterEffect: null == lobsterEffect
            ? _value.lobsterEffect
            : lobsterEffect as WeatherLobsterEffect,
        fetchedAt: null == fetchedAt ? _value.fetchedAt : fetchedAt as String,
      ) as $Val);
}

abstract class _$$WeatherResponseImplCopyWith<$Res>
    implements $WeatherResponseCopyWith<$Res> {
  factory _$$WeatherResponseImplCopyWith(_$WeatherResponseImpl value,
          $Res Function(_$WeatherResponseImpl) then) =
      __$$WeatherResponseImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    String location,
    WeatherCondition condition,
    double temperatureCelsius,
    int humidity,
    double windSpeedKmh,
    int uvIndex,
    WeatherLobsterEffect lobsterEffect,
    String fetchedAt,
  });
}

class __$$WeatherResponseImplCopyWithImpl<$Res>
    extends _$WeatherResponseCopyWithImpl<$Res, _$WeatherResponseImpl>
    implements _$$WeatherResponseImplCopyWith<$Res> {
  __$$WeatherResponseImplCopyWithImpl(
      _$WeatherResponseImpl _value, $Res Function(_$WeatherResponseImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? location = null,
    Object? condition = null,
    Object? temperatureCelsius = null,
    Object? humidity = null,
    Object? windSpeedKmh = null,
    Object? uvIndex = null,
    Object? lobsterEffect = null,
    Object? fetchedAt = null,
  }) =>
      _then(_$WeatherResponseImpl(
        location: null == location ? _value.location : location as String,
        condition: null == condition
            ? _value.condition
            : condition as WeatherCondition,
        temperatureCelsius: null == temperatureCelsius
            ? _value.temperatureCelsius
            : temperatureCelsius as double,
        humidity: null == humidity ? _value.humidity : humidity as int,
        windSpeedKmh:
            null == windSpeedKmh ? _value.windSpeedKmh : windSpeedKmh as double,
        uvIndex: null == uvIndex ? _value.uvIndex : uvIndex as int,
        lobsterEffect: null == lobsterEffect
            ? _value.lobsterEffect
            : lobsterEffect as WeatherLobsterEffect,
        fetchedAt: null == fetchedAt ? _value.fetchedAt : fetchedAt as String,
      ));
}

@JsonSerializable()
class _$WeatherResponseImpl implements _WeatherResponse {
  const _$WeatherResponseImpl({
    required this.location,
    required this.condition,
    required this.temperatureCelsius,
    required this.humidity,
    required this.windSpeedKmh,
    this.uvIndex = 0,
    required this.lobsterEffect,
    required this.fetchedAt,
  });

  factory _$WeatherResponseImpl.fromJson(Map<String, dynamic> json) =>
      _$$WeatherResponseImplFromJson(json);

  @override
  final String location;
  @override
  final WeatherCondition condition;
  @override
  final double temperatureCelsius;
  @override
  final int humidity;
  @override
  final double windSpeedKmh;
  @override
  @JsonKey()
  final int uvIndex;
  @override
  final WeatherLobsterEffect lobsterEffect;
  @override
  final String fetchedAt;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other.runtimeType == runtimeType &&
          other is _$WeatherResponseImpl &&
          other.location == location &&
          other.condition == condition &&
          other.fetchedAt == fetchedAt);

  @JsonKey(ignore: true)
  @override
  int get hashCode =>
      Object.hash(runtimeType, location, condition, fetchedAt);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$WeatherResponseImplCopyWith<_$WeatherResponseImpl> get copyWith =>
      __$$WeatherResponseImplCopyWithImpl<_$WeatherResponseImpl>(
          this, _$identity);

  @override
  Map<String, dynamic> toJson() => _$$WeatherResponseImplToJson(this);
}

abstract class _WeatherResponse implements WeatherResponse {
  const factory _WeatherResponse({
    required final String location,
    required final WeatherCondition condition,
    required final double temperatureCelsius,
    required final int humidity,
    required final double windSpeedKmh,
    final int uvIndex,
    required final WeatherLobsterEffect lobsterEffect,
    required final String fetchedAt,
  }) = _$WeatherResponseImpl;

  factory _WeatherResponse.fromJson(Map<String, dynamic> json) =
      _$WeatherResponseImpl.fromJson;

  @override
  String get location;
  @override
  WeatherCondition get condition;
  @override
  double get temperatureCelsius;
  @override
  int get humidity;
  @override
  double get windSpeedKmh;
  @override
  int get uvIndex;
  @override
  WeatherLobsterEffect get lobsterEffect;
  @override
  String get fetchedAt;
  @override
  @JsonKey(ignore: true)
  _$$WeatherResponseImplCopyWith<_$WeatherResponseImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

// ignore: unused_element
const freezed = Object();
