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
class WeatherLobsterEffect {
  const WeatherLobsterEffect({
    required this.emotionBias,
    this.chillDelta = 0,
    this.energyDelta = 0,
    this.narrative,
  });

  /// Which emotion this weather nudges toward.
  final String emotionBias;

  /// Delta applied to chillScore (-100 to +100).
  final int chillDelta;

  /// Delta applied to energy (-100 to +100).
  final int energyDelta;

  /// Short narrative description of the effect.
  final String? narrative;

  WeatherLobsterEffect copyWith({
    String? emotionBias,
    int? chillDelta,
    int? energyDelta,
    String? narrative,
  }) {
    return WeatherLobsterEffect(
      emotionBias: emotionBias ?? this.emotionBias,
      chillDelta: chillDelta ?? this.chillDelta,
      energyDelta: energyDelta ?? this.energyDelta,
      narrative: narrative ?? this.narrative,
    );
  }

  factory WeatherLobsterEffect.fromJson(Map<String, Object?> json) {
    return WeatherLobsterEffect(
      emotionBias: json['emotionBias'] as String? ?? 'chill',
      chillDelta: (json['chillDelta'] as num?)?.toInt() ?? 0,
      energyDelta: (json['energyDelta'] as num?)?.toInt() ?? 0,
      narrative: json['narrative'] as String?,
    );
  }

  Map<String, Object?> toJson() {
    return {
      'emotionBias': emotionBias,
      if (chillDelta != 0) 'chillDelta': chillDelta,
      if (energyDelta != 0) 'energyDelta': energyDelta,
      if (narrative != null) 'narrative': narrative,
    };
  }
}

/// Current weather snapshot for a given location.
class WeatherResponse {
  const WeatherResponse({
    required this.location,
    required this.condition,
    required this.temperatureCelsius,
    required this.humidity,
    required this.windSpeedKmh,
    this.uvIndex = 0,
    required this.lobsterEffect,
    required this.fetchedAt,
  });

  /// City or place name.
  final String location;

  /// Weather condition.
  final WeatherCondition condition;

  /// Temperature in degrees Celsius.
  final double temperatureCelsius;

  /// Humidity percentage 0–100.
  final int humidity;

  /// Wind speed in km/h.
  final double windSpeedKmh;

  /// UV index 0–11+.
  final int uvIndex;

  /// Lobster-engine-specific effect of this weather.
  final WeatherLobsterEffect lobsterEffect;

  /// ISO-8601 timestamp when this weather data was fetched.
  final String fetchedAt;

  WeatherResponse copyWith({
    String? location,
    WeatherCondition? condition,
    double? temperatureCelsius,
    int? humidity,
    double? windSpeedKmh,
    int? uvIndex,
    WeatherLobsterEffect? lobsterEffect,
    String? fetchedAt,
  }) {
    return WeatherResponse(
      location: location ?? this.location,
      condition: condition ?? this.condition,
      temperatureCelsius: temperatureCelsius ?? this.temperatureCelsius,
      humidity: humidity ?? this.humidity,
      windSpeedKmh: windSpeedKmh ?? this.windSpeedKmh,
      uvIndex: uvIndex ?? this.uvIndex,
      lobsterEffect: lobsterEffect ?? this.lobsterEffect,
      fetchedAt: fetchedAt ?? this.fetchedAt,
    );
  }

  factory WeatherResponse.fromJson(Map<String, Object?> json) {
    final effectJson = json['lobsterEffect'];
    return WeatherResponse(
      location: json['location'] as String? ?? '',
      condition: _weatherConditionFromJson(json['condition'] as String?),
      temperatureCelsius:
          (json['temperatureCelsius'] as num?)?.toDouble() ?? 20.0,
      humidity: (json['humidity'] as num?)?.toInt() ?? 50,
      windSpeedKmh: (json['windSpeedKmh'] as num?)?.toDouble() ?? 0.0,
      uvIndex: (json['uvIndex'] as num?)?.toInt() ?? 0,
      lobsterEffect: effectJson is Map
          ? WeatherLobsterEffect.fromJson(effectJson.cast<String, Object?>())
          : const WeatherLobsterEffect(emotionBias: 'chill'),
      fetchedAt: json['fetchedAt'] as String? ?? '',
    );
  }

  Map<String, Object?> toJson() {
    return {
      'location': location,
      'condition': condition.name,
      'temperatureCelsius': temperatureCelsius,
      'humidity': humidity,
      'windSpeedKmh': windSpeedKmh,
      if (uvIndex != 0) 'uvIndex': uvIndex,
      'lobsterEffect': lobsterEffect.toJson(),
      'fetchedAt': fetchedAt,
    };
  }

  @override
  bool operator ==(Object other) {
    return other is WeatherResponse &&
        other.location == location &&
        other.fetchedAt == fetchedAt;
  }

  @override
  int get hashCode => Object.hash(location, fetchedAt);
}

WeatherCondition _weatherConditionFromJson(String? value) {
  switch (value) {
    case 'clear':
      return WeatherCondition.clear;
    case 'partlyCloudy':
      return WeatherCondition.partlyCloudy;
    case 'cloudy':
      return WeatherCondition.cloudy;
    case 'rainy':
      return WeatherCondition.rainy;
    case 'stormy':
      return WeatherCondition.stormy;
    case 'snowy':
      return WeatherCondition.snowy;
    case 'foggy':
      return WeatherCondition.foggy;
    case 'windy':
      return WeatherCondition.windy;
    default:
      return WeatherCondition.clear;
  }
}
