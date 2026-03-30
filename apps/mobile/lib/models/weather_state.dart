import 'package:flutter/material.dart';

/// The weather types the app simulates.
enum WeatherType {
  sunny,
  cloudy,
  rainy,
  stormy,
  snowy,
  foggy,
  windy,
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
class WeatherState {
  const WeatherState({
    required this.type,
    this.temperatureCelsius = 20,
    this.windSpeed = 0,
    this.rainIntensity = 0,
    required this.updatedAt,
  });

  final WeatherType type;

  /// Temperature in Celsius.
  final int temperatureCelsius;

  /// Wind speed in m/s.
  final double windSpeed;

  /// Rain intensity 0.0–1.0 (only meaningful for rainy/stormy).
  final double rainIntensity;

  /// ISO-8601 timestamp of last weather update.
  final String updatedAt;

  WeatherState copyWith({
    WeatherType? type,
    int? temperatureCelsius,
    double? windSpeed,
    double? rainIntensity,
    String? updatedAt,
  }) {
    return WeatherState(
      type: type ?? this.type,
      temperatureCelsius: temperatureCelsius ?? this.temperatureCelsius,
      windSpeed: windSpeed ?? this.windSpeed,
      rainIntensity: rainIntensity ?? this.rainIntensity,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  factory WeatherState.fromJson(Map<String, Object?> json) {
    return WeatherState(
      type: _weatherTypeFromJson(json['type'] as String?),
      temperatureCelsius:
          (json['temperatureCelsius'] as num?)?.toInt() ?? 20,
      windSpeed: (json['windSpeed'] as num?)?.toDouble() ?? 0,
      rainIntensity: (json['rainIntensity'] as num?)?.toDouble() ?? 0,
      updatedAt: json['updatedAt'] as String? ?? '',
    );
  }

  Map<String, Object?> toJson() {
    return {
      'type': _weatherTypeToJson(type),
      'temperatureCelsius': temperatureCelsius,
      'windSpeed': windSpeed,
      'rainIntensity': rainIntensity,
      'updatedAt': updatedAt,
    };
  }

  @override
  bool operator ==(Object other) {
    return other is WeatherState &&
        other.type == type &&
        other.temperatureCelsius == temperatureCelsius &&
        other.windSpeed == windSpeed &&
        other.rainIntensity == rainIntensity &&
        other.updatedAt == updatedAt;
  }

  @override
  int get hashCode => Object.hash(
        type,
        temperatureCelsius,
        windSpeed,
        rainIntensity,
        updatedAt,
      );
}

WeatherType _weatherTypeFromJson(String? value) {
  switch (value) {
    case 'sunny':
      return WeatherType.sunny;
    case 'cloudy':
      return WeatherType.cloudy;
    case 'rainy':
      return WeatherType.rainy;
    case 'stormy':
      return WeatherType.stormy;
    case 'snowy':
      return WeatherType.snowy;
    case 'foggy':
      return WeatherType.foggy;
    case 'windy':
      return WeatherType.windy;
    case 'night_clear':
      return WeatherType.nightClear;
    default:
      return WeatherType.sunny;
  }
}

String _weatherTypeToJson(WeatherType type) {
  switch (type) {
    case WeatherType.sunny:
      return 'sunny';
    case WeatherType.cloudy:
      return 'cloudy';
    case WeatherType.rainy:
      return 'rainy';
    case WeatherType.stormy:
      return 'stormy';
    case WeatherType.snowy:
      return 'snowy';
    case WeatherType.foggy:
      return 'foggy';
    case WeatherType.windy:
      return 'windy';
    case WeatherType.nightClear:
      return 'night_clear';
  }
}
