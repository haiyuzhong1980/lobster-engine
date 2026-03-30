// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'activity.dart';

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

ActivityReport _$ActivityReportFromJson(Map<String, dynamic> json) {
  return _ActivityReport.fromJson(json);
}

mixin _$ActivityReport {
  String get lobsterId => throw _privateConstructorUsedError;
  ActivityType get type => throw _privateConstructorUsedError;
  double get confidence => throw _privateConstructorUsedError;
  Map<String, Object> get metadata => throw _privateConstructorUsedError;
  String get detectedAt => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $ActivityReportCopyWith<ActivityReport> get copyWith =>
      throw _privateConstructorUsedError;
}

abstract class $ActivityReportCopyWith<$Res> {
  factory $ActivityReportCopyWith(
          ActivityReport value, $Res Function(ActivityReport) then) =
      _$ActivityReportCopyWithImpl<$Res, ActivityReport>;
  @useResult
  $Res call({
    String lobsterId,
    ActivityType type,
    double confidence,
    Map<String, Object> metadata,
    String detectedAt,
  });
}

class _$ActivityReportCopyWithImpl<$Res, $Val extends ActivityReport>
    implements $ActivityReportCopyWith<$Res> {
  _$ActivityReportCopyWithImpl(this._value, this._then);
  final $Val _value;
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? lobsterId = null,
    Object? type = null,
    Object? confidence = null,
    Object? metadata = null,
    Object? detectedAt = null,
  }) =>
      _then(_value.copyWith(
        lobsterId: null == lobsterId ? _value.lobsterId : lobsterId as String,
        type: null == type ? _value.type : type as ActivityType,
        confidence: null == confidence ? _value.confidence : confidence as double,
        metadata: null == metadata
            ? _value.metadata
            : metadata as Map<String, Object>,
        detectedAt: null == detectedAt ? _value.detectedAt : detectedAt as String,
      ) as $Val);
}

abstract class _$$ActivityReportImplCopyWith<$Res>
    implements $ActivityReportCopyWith<$Res> {
  factory _$$ActivityReportImplCopyWith(_$ActivityReportImpl value,
          $Res Function(_$ActivityReportImpl) then) =
      __$$ActivityReportImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    String lobsterId,
    ActivityType type,
    double confidence,
    Map<String, Object> metadata,
    String detectedAt,
  });
}

class __$$ActivityReportImplCopyWithImpl<$Res>
    extends _$ActivityReportCopyWithImpl<$Res, _$ActivityReportImpl>
    implements _$$ActivityReportImplCopyWith<$Res> {
  __$$ActivityReportImplCopyWithImpl(
      _$ActivityReportImpl _value, $Res Function(_$ActivityReportImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? lobsterId = null,
    Object? type = null,
    Object? confidence = null,
    Object? metadata = null,
    Object? detectedAt = null,
  }) =>
      _then(_$ActivityReportImpl(
        lobsterId: null == lobsterId ? _value.lobsterId : lobsterId as String,
        type: null == type ? _value.type : type as ActivityType,
        confidence: null == confidence ? _value.confidence : confidence as double,
        metadata: null == metadata
            ? _value._metadata
            : metadata as Map<String, Object>,
        detectedAt: null == detectedAt ? _value.detectedAt : detectedAt as String,
      ));
}

@JsonSerializable()
class _$ActivityReportImpl implements _ActivityReport {
  const _$ActivityReportImpl({
    required this.lobsterId,
    required this.type,
    required this.confidence,
    final Map<String, Object> metadata = const {},
    required this.detectedAt,
  }) : _metadata = metadata;

  factory _$ActivityReportImpl.fromJson(Map<String, dynamic> json) =>
      _$$ActivityReportImplFromJson(json);

  @override
  final String lobsterId;
  @override
  final ActivityType type;
  @override
  final double confidence;
  final Map<String, Object> _metadata;
  @override
  @JsonKey()
  Map<String, Object> get metadata {
    if (_metadata is Map<String, Object>) return Map.unmodifiable(_metadata);
    return _metadata;
  }

  @override
  final String detectedAt;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other.runtimeType == runtimeType &&
          other is _$ActivityReportImpl &&
          other.lobsterId == lobsterId &&
          other.type == type &&
          other.detectedAt == detectedAt);

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(runtimeType, lobsterId, type, detectedAt);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$ActivityReportImplCopyWith<_$ActivityReportImpl> get copyWith =>
      __$$ActivityReportImplCopyWithImpl<_$ActivityReportImpl>(
          this, _$identity);

  @override
  Map<String, dynamic> toJson() => _$$ActivityReportImplToJson(this);
}

abstract class _ActivityReport implements ActivityReport {
  const factory _ActivityReport({
    required final String lobsterId,
    required final ActivityType type,
    required final double confidence,
    final Map<String, Object> metadata,
    required final String detectedAt,
  }) = _$ActivityReportImpl;

  factory _ActivityReport.fromJson(Map<String, dynamic> json) =
      _$ActivityReportImpl.fromJson;

  @override
  String get lobsterId;
  @override
  ActivityType get type;
  @override
  double get confidence;
  @override
  Map<String, Object> get metadata;
  @override
  String get detectedAt;
  @override
  @JsonKey(ignore: true)
  _$$ActivityReportImplCopyWith<_$ActivityReportImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

// ActivityResponse ------------------------------------------------------------

ActivityResponse _$ActivityResponseFromJson(Map<String, dynamic> json) =>
    _ActivityResponse.fromJson(json);

mixin _$ActivityResponse {
  bool get accepted => throw _privateConstructorUsedError;
  ActivityType get currentActivity => throw _privateConstructorUsedError;
  int get xpGranted => throw _privateConstructorUsedError;
  String? get message => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $ActivityResponseCopyWith<ActivityResponse> get copyWith =>
      throw _privateConstructorUsedError;
}

abstract class $ActivityResponseCopyWith<$Res> {
  factory $ActivityResponseCopyWith(
          ActivityResponse value, $Res Function(ActivityResponse) then) =
      _$ActivityResponseCopyWithImpl<$Res, ActivityResponse>;
  @useResult
  $Res call({
    bool accepted,
    ActivityType currentActivity,
    int xpGranted,
    String? message,
  });
}

class _$ActivityResponseCopyWithImpl<$Res, $Val extends ActivityResponse>
    implements $ActivityResponseCopyWith<$Res> {
  _$ActivityResponseCopyWithImpl(this._value, this._then);
  final $Val _value;
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? accepted = null,
    Object? currentActivity = null,
    Object? xpGranted = null,
    Object? message = freezed,
  }) =>
      _then(_value.copyWith(
        accepted: null == accepted ? _value.accepted : accepted as bool,
        currentActivity: null == currentActivity
            ? _value.currentActivity
            : currentActivity as ActivityType,
        xpGranted: null == xpGranted ? _value.xpGranted : xpGranted as int,
        message: freezed == message ? _value.message : message as String?,
      ) as $Val);
}

abstract class _$$ActivityResponseImplCopyWith<$Res>
    implements $ActivityResponseCopyWith<$Res> {
  factory _$$ActivityResponseImplCopyWith(_$ActivityResponseImpl value,
          $Res Function(_$ActivityResponseImpl) then) =
      __$$ActivityResponseImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    bool accepted,
    ActivityType currentActivity,
    int xpGranted,
    String? message,
  });
}

class __$$ActivityResponseImplCopyWithImpl<$Res>
    extends _$ActivityResponseCopyWithImpl<$Res, _$ActivityResponseImpl>
    implements _$$ActivityResponseImplCopyWith<$Res> {
  __$$ActivityResponseImplCopyWithImpl(_$ActivityResponseImpl _value,
      $Res Function(_$ActivityResponseImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? accepted = null,
    Object? currentActivity = null,
    Object? xpGranted = null,
    Object? message = freezed,
  }) =>
      _then(_$ActivityResponseImpl(
        accepted: null == accepted ? _value.accepted : accepted as bool,
        currentActivity: null == currentActivity
            ? _value.currentActivity
            : currentActivity as ActivityType,
        xpGranted: null == xpGranted ? _value.xpGranted : xpGranted as int,
        message: freezed == message ? _value.message : message as String?,
      ));
}

@JsonSerializable()
class _$ActivityResponseImpl implements _ActivityResponse {
  const _$ActivityResponseImpl({
    required this.accepted,
    required this.currentActivity,
    this.xpGranted = 0,
    this.message,
  });

  factory _$ActivityResponseImpl.fromJson(Map<String, dynamic> json) =>
      _$$ActivityResponseImplFromJson(json);

  @override
  final bool accepted;
  @override
  final ActivityType currentActivity;
  @override
  @JsonKey()
  final int xpGranted;
  @override
  final String? message;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other.runtimeType == runtimeType &&
          other is _$ActivityResponseImpl &&
          other.accepted == accepted &&
          other.currentActivity == currentActivity);

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(runtimeType, accepted, currentActivity, xpGranted);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$ActivityResponseImplCopyWith<_$ActivityResponseImpl> get copyWith =>
      __$$ActivityResponseImplCopyWithImpl<_$ActivityResponseImpl>(
          this, _$identity);

  @override
  Map<String, dynamic> toJson() => _$$ActivityResponseImplToJson(this);
}

abstract class _ActivityResponse implements ActivityResponse {
  const factory _ActivityResponse({
    required final bool accepted,
    required final ActivityType currentActivity,
    final int xpGranted,
    final String? message,
  }) = _$ActivityResponseImpl;

  factory _ActivityResponse.fromJson(Map<String, dynamic> json) =
      _$ActivityResponseImpl.fromJson;

  @override
  bool get accepted;
  @override
  ActivityType get currentActivity;
  @override
  int get xpGranted;
  @override
  String? get message;
  @override
  @JsonKey(ignore: true)
  _$$ActivityResponseImplCopyWith<_$ActivityResponseImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

// SensorState -----------------------------------------------------------------

SensorState _$SensorStateFromJson(Map<String, dynamic> json) =>
    _SensorState.fromJson(json);

mixin _$SensorState {
  SensorActivityType get current => throw _privateConstructorUsedError;
  double get confidence => throw _privateConstructorUsedError;
  double get accelerometerMagnitude => throw _privateConstructorUsedError;
  int? get stepCount => throw _privateConstructorUsedError;
  String? get lastUpdatedAt => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $SensorStateCopyWith<SensorState> get copyWith =>
      throw _privateConstructorUsedError;
}

abstract class $SensorStateCopyWith<$Res> {
  factory $SensorStateCopyWith(
          SensorState value, $Res Function(SensorState) then) =
      _$SensorStateCopyWithImpl<$Res, SensorState>;
  @useResult
  $Res call({
    SensorActivityType current,
    double confidence,
    double accelerometerMagnitude,
    int? stepCount,
    String? lastUpdatedAt,
  });
}

class _$SensorStateCopyWithImpl<$Res, $Val extends SensorState>
    implements $SensorStateCopyWith<$Res> {
  _$SensorStateCopyWithImpl(this._value, this._then);
  final $Val _value;
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? current = null,
    Object? confidence = null,
    Object? accelerometerMagnitude = null,
    Object? stepCount = freezed,
    Object? lastUpdatedAt = freezed,
  }) =>
      _then(_value.copyWith(
        current: null == current
            ? _value.current
            : current as SensorActivityType,
        confidence: null == confidence ? _value.confidence : confidence as double,
        accelerometerMagnitude: null == accelerometerMagnitude
            ? _value.accelerometerMagnitude
            : accelerometerMagnitude as double,
        stepCount: freezed == stepCount ? _value.stepCount : stepCount as int?,
        lastUpdatedAt: freezed == lastUpdatedAt
            ? _value.lastUpdatedAt
            : lastUpdatedAt as String?,
      ) as $Val);
}

abstract class _$$SensorStateImplCopyWith<$Res>
    implements $SensorStateCopyWith<$Res> {
  factory _$$SensorStateImplCopyWith(
          _$SensorStateImpl value, $Res Function(_$SensorStateImpl) then) =
      __$$SensorStateImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    SensorActivityType current,
    double confidence,
    double accelerometerMagnitude,
    int? stepCount,
    String? lastUpdatedAt,
  });
}

class __$$SensorStateImplCopyWithImpl<$Res>
    extends _$SensorStateCopyWithImpl<$Res, _$SensorStateImpl>
    implements _$$SensorStateImplCopyWith<$Res> {
  __$$SensorStateImplCopyWithImpl(
      _$SensorStateImpl _value, $Res Function(_$SensorStateImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? current = null,
    Object? confidence = null,
    Object? accelerometerMagnitude = null,
    Object? stepCount = freezed,
    Object? lastUpdatedAt = freezed,
  }) =>
      _then(_$SensorStateImpl(
        current: null == current
            ? _value.current
            : current as SensorActivityType,
        confidence: null == confidence ? _value.confidence : confidence as double,
        accelerometerMagnitude: null == accelerometerMagnitude
            ? _value.accelerometerMagnitude
            : accelerometerMagnitude as double,
        stepCount: freezed == stepCount ? _value.stepCount : stepCount as int?,
        lastUpdatedAt: freezed == lastUpdatedAt
            ? _value.lastUpdatedAt
            : lastUpdatedAt as String?,
      ));
}

@JsonSerializable()
class _$SensorStateImpl implements _SensorState {
  const _$SensorStateImpl({
    this.current = SensorActivityType.unknown,
    this.confidence = 0.0,
    this.accelerometerMagnitude = 0.0,
    this.stepCount,
    this.lastUpdatedAt,
  });

  factory _$SensorStateImpl.fromJson(Map<String, dynamic> json) =>
      _$$SensorStateImplFromJson(json);

  @override
  @JsonKey()
  final SensorActivityType current;
  @override
  @JsonKey()
  final double confidence;
  @override
  @JsonKey()
  final double accelerometerMagnitude;
  @override
  final int? stepCount;
  @override
  final String? lastUpdatedAt;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other.runtimeType == runtimeType &&
          other is _$SensorStateImpl &&
          other.current == current &&
          other.confidence == confidence);

  @JsonKey(ignore: true)
  @override
  int get hashCode =>
      Object.hash(runtimeType, current, confidence, accelerometerMagnitude);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$SensorStateImplCopyWith<_$SensorStateImpl> get copyWith =>
      __$$SensorStateImplCopyWithImpl<_$SensorStateImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() => _$$SensorStateImplToJson(this);
}

abstract class _SensorState implements SensorState {
  const factory _SensorState({
    final SensorActivityType current,
    final double confidence,
    final double accelerometerMagnitude,
    final int? stepCount,
    final String? lastUpdatedAt,
  }) = _$SensorStateImpl;

  factory _SensorState.fromJson(Map<String, dynamic> json) =
      _$SensorStateImpl.fromJson;

  @override
  SensorActivityType get current;
  @override
  double get confidence;
  @override
  double get accelerometerMagnitude;
  @override
  int? get stepCount;
  @override
  String? get lastUpdatedAt;
  @override
  @JsonKey(ignore: true)
  _$$SensorStateImplCopyWith<_$SensorStateImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

// ignore: unused_element
const freezed = Object();
