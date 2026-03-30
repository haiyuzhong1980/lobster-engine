import 'package:freezed_annotation/freezed_annotation.dart';

part 'weather.freezed.dart';
part 'weather.g.dart';

/// Weather condition categories understood by the lobster engine.
enum WeatherCondition {
  clear,
  partlyCloudy,
  cloudy,
  rainy,
  stormy,
  snowy,
  foggy,
  windy,
}

/// How the current weather modifies the lobster's mood.
@freezed
class WeatherLobsterEffect with _$WeatherLobsterEffect {
  const factory WeatherLobsterEffect({
    /// Which emotion this weather nudges toward.
    required String emotionBias,

    /// Delta applied to chillScore (-100 to +100).
    @Default(0) int chillDelta,

    /// Delta applied to energy (-100 to +100).
    @Default(0) int energyDelta,

    /// Short narrative description of the effect.
    String? narrative,
  }) = _WeatherLobsterEffect;

  factory WeatherLobsterEffect.fromJson(Map<String, Object?> json) =>
      _$WeatherLobsterEffectFromJson(json);
}

/// Current weather snapshot for a given location.
@freezed
class WeatherResponse with _$WeatherResponse {
  const factory WeatherResponse({
    /// City or place name.
    required String location,

    /// Weather condition.
    required WeatherCondition condition,

    /// Temperature in degrees Celsius.
    required double temperatureCelsius,

    /// Humidity percentage 0–100.
    required int humidity,

    /// Wind speed in km/h.
    required double windSpeedKmh,

    /// UV index 0–11+.
    @Default(0) int uvIndex,

    /// Lobster-engine-specific effect of this weather.
    required WeatherLobsterEffect lobsterEffect,

    /// ISO-8601 timestamp when this weather data was fetched.
    required String fetchedAt,
  }) = _WeatherResponse;

  factory WeatherResponse.fromJson(Map<String, Object?> json) =>
      _$WeatherResponseFromJson(json);
}
