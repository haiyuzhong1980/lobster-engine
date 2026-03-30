import 'package:flutter/material.dart';

/// Immutable configuration for a single underwater scene.
@immutable
class SceneConfig {
  final List<Color> gradient;
  final String description;
  final String icon;

  const SceneConfig({
    required this.gradient,
    required this.description,
    required this.icon,
  });
}

/// Renders a full-bleed underwater scene background as a vertical gradient.
///
/// Falls back to [SceneBackground.fallbackScene] when an unknown [scene] key
/// is provided so the UI never shows an empty frame.
class SceneBackground extends StatelessWidget {
  final String scene;

  /// Optional weather condition that can tint or darken the gradient.
  final String? weather;

  const SceneBackground({
    super.key,
    required this.scene,
    this.weather,
  });

  // ---------------------------------------------------------------------------
  // Scene catalogue (18 scenes)
  // ---------------------------------------------------------------------------

  static const String fallbackScene = 'lobster_home';

  static const Map<String, SceneConfig> scenes = {
    'lobster_home': SceneConfig(
      gradient: [Color(0xFF1A535C), Color(0xFF2B7A78)],
      description: '海底小屋',
      icon: '🏠',
    ),
    'shallow_sea': SceneConfig(
      gradient: [Color(0xFF4ECDC4), Color(0xFF45B7D1)],
      description: '浅海',
      icon: '🌊',
    ),
    'coral_reef': SceneConfig(
      gradient: [Color(0xFF2B7A78), Color(0xFF3AAFA9)],
      description: '珊瑚礁',
      icon: '🪸',
    ),
    'coral_tunnel': SceneConfig(
      gradient: [Color(0xFF17252A), Color(0xFF2B7A78)],
      description: '珊瑚隧道',
      icon: '🚇',
    ),
    'sea_highway': SceneConfig(
      gradient: [Color(0xFF3AAFA9), Color(0xFF4ECDC4)],
      description: '海底大道',
      icon: '🛣️',
    ),
    'fish_crowd': SceneConfig(
      gradient: [Color(0xFF2B7A78), Color(0xFF45B7D1)],
      description: '鱼群中',
      icon: '🐟',
    ),
    'deep_tunnel': SceneConfig(
      gradient: [Color(0xFF0B132B), Color(0xFF1C2541)],
      description: '深海隧道',
      icon: '🌊',
    ),
    'sky_above': SceneConfig(
      gradient: [Color(0xFFFFE66D), Color(0xFF45B7D1)],
      description: '海面之上',
      icon: '☁️',
    ),
    'surface': SceneConfig(
      gradient: [Color(0xFF45B7D1), Color(0xFF4ECDC4)],
      description: '海面',
      icon: '🏊',
    ),
    'lobster_bedroom': SceneConfig(
      gradient: [Color(0xFF1A535C), Color(0xFF17252A)],
      description: '龙虾卧室',
      icon: '🛏️',
    ),
    'lobster_canteen': SceneConfig(
      gradient: [Color(0xFF2B7A78), Color(0xFFE87461)],
      description: '龙虾食堂',
      icon: '🍜',
    ),
    'coral_shelter': SceneConfig(
      gradient: [Color(0xFF2B7A78), Color(0xFF5C6B73)],
      description: '珊瑚避雨处',
      icon: '☔',
    ),
    'frozen_reef': SceneConfig(
      gradient: [Color(0xFFD6E6F2), Color(0xFFB9D7EA)],
      description: '冰冻珊瑚',
      icon: '❄️',
    ),
    'turbulent_current': SceneConfig(
      gradient: [Color(0xFF3D5A80), Color(0xFF5C6B73)],
      description: '湍流',
      icon: '💨',
    ),
    'coral_crevice': SceneConfig(
      gradient: [Color(0xFF0B132B), Color(0xFF3D5A80)],
      description: '珊瑚缝隙',
      icon: '⚡',
    ),
    'murky_water': SceneConfig(
      gradient: [Color(0xFF5C6B73), Color(0xFF8D99AE)],
      description: '浑浊水域',
      icon: '🌫️',
    ),
    'ice_berg': SceneConfig(
      gradient: [Color(0xFFB9D7EA), Color(0xFFD6E6F2)],
      description: '冰山',
      icon: '🧊',
    ),
    'fluffy_shell': SceneConfig(
      gradient: [Color(0xFFE87461), Color(0xFFFFE66D)],
      description: '毛绒壳',
      icon: '🧸',
    ),
  };

  // ---------------------------------------------------------------------------
  // Weather tint overlays
  // ---------------------------------------------------------------------------

  /// Returns a semi-transparent tint colour for the given weather condition.
  /// Returns [Colors.transparent] for unknown / null conditions.
  static Color _weatherTint(String? weatherCondition) {
    switch (weatherCondition) {
      case 'storm':
      case 'thunder':
        return const Color(0x331C2541); // dark navy
      case 'fog':
        return const Color(0x33FFFFFF); // white
      case 'rain':
        return const Color(0x224682B4); // blue-grey
      case 'snow':
        return const Color(0x22E0F0FF); // pale blue
      default:
        return Colors.transparent;
    }
  }

  @override
  Widget build(BuildContext context) {
    final config = scenes[scene] ?? scenes[fallbackScene]!;
    final tint = _weatherTint(weather);

    return Stack(
      fit: StackFit.expand,
      children: [
        // Base gradient
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: config.gradient,
            ),
          ),
        ),
        // Weather tint
        if (tint != Colors.transparent)
          ColoredBox(color: tint),
        // Scene icon hint (subtle, bottom-left)
        Positioned(
          left: 16,
          bottom: 20,
          child: Text(
            config.icon,
            style: const TextStyle(fontSize: 28),
          ),
        ),
      ],
    );
  }
}
