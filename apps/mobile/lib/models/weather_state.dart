import 'package:flutter/material.dart';
import 'package:freezed_annotation/freezed_annotation.dart';

part 'weather_state.freezed.dart';
part 'weather_state.g.dart';

/// The weather types the app simulates.
enum WeatherType {
  @JsonValue('sunny')
  sunny,
  @JsonValue('cloudy')
  cloudy,
  @JsonValue('rainy')
  rainy,
  @JsonValue('stormy')
  stormy,
  @JsonValue('snowy')
  snowy,
  @JsonValue('foggy')
  foggy,
  @JsonValue('windy')
  windy,
  @JsonValue('night_clear')
  nightClear,
}

extension WeatherTypeDisplay on WeatherType {
  String get label => switch (this) {
        WeatherType.sunny => '晴天',
        WeatherType.cloudy => '多云',
        WeatherType.rainy => '下雨',
        WeatherType.stormy => '暴风雨',
        WeatherType.snowy => '下雪',
        WeatherType.foggy => '起雾',
        WeatherType.windy => '大风',
        WeatherType.nightClear => '晴夜',
      };

  String get emoji => switch (this) {
        WeatherType.sunny => '☀️',
        WeatherType.cloudy => '☁️',
        WeatherType.rainy => '🌧️',
        WeatherType.stormy => '⛈️',
        WeatherType.snowy => '❄️',
        WeatherType.foggy => '🌫️',
        WeatherType.windy => '💨',
        WeatherType.nightClear => '🌙',
      };

  /// Background gradient colors for the scene.
  List<Color> get sceneGradient => switch (this) {
        WeatherType.sunny => [
            const Color(0xFF87CEEB),
            const Color(0xFFB8E8F0),
          ],
        WeatherType.cloudy => [
            const Color(0xFF9EA7B0),
            const Color(0xFFCFD8DC),
          ],
        WeatherType.rainy => [
            const Color(0xFF546E7A),
            const Color(0xFF78909C),
          ],
        WeatherType.stormy => [
            const Color(0xFF263238),
            const Color(0xFF455A64),
          ],
        WeatherType.snowy => [
            const Color(0xFFB0BEC5),
            const Color(0xFFECEFF1),
          ],
        WeatherType.foggy => [
            const Color(0xFF78909C),
            const Color(0xFFB0BEC5),
          ],
        WeatherType.windy => [
            const Color(0xFF4FC3F7),
            const Color(0xFF81D4FA),
          ],
        WeatherType.nightClear => [
            const Color(0xFF1A237E),
            const Color(0xFF283593),
          ],
      };
}

/// Current weather state passed to scene and effect renderers.
@freezed
class WeatherState with _$WeatherState {
  const factory WeatherState({
    required WeatherType type,

    /// Temperature in Celsius.
    @Default(20) int temperatureCelsius,

    /// Wind speed in m/s.
    @Default(0) double windSpeed,

    /// Rain intensity 0.0–1.0 (only meaningful for rainy/stormy).
    @Default(0) double rainIntensity,

    /// ISO-8601 timestamp of last weather update.
    required String updatedAt,
  }) = _WeatherState;

  factory WeatherState.fromJson(Map<String, Object?> json) =>
      _$WeatherStateFromJson(json);
}
