import 'package:flutter/material.dart';

import 'package:tangping_lobster/widgets/bubble_effect.dart';
import 'package:tangping_lobster/widgets/lobster_placeholder.dart';
import 'package:tangping_lobster/widgets/scene_background.dart';
import 'package:tangping_lobster/widgets/weather_overlay.dart';

/// Main compositor that layers all rendering sub-widgets into the final scene.
///
/// Layer order (bottom to top):
/// 1. [SceneBackground] — full-bleed gradient + scene icon
/// 2. [BubbleEffect]    — ambient rising bubbles (ignores pointer)
/// 3. [LobsterPlaceholder] — animated lobster centred in the frame
/// 4. [WeatherOverlay]  — particle / colour overlay (ignores pointer, optional)
class LobsterRenderer extends StatelessWidget {
  /// Scene identifier from [SceneBackground.scenes].
  final String currentScene;

  /// Human-readable description of what the lobster is currently doing.
  final String currentAction;

  /// Emotion key consumed by [LobsterPlaceholder].
  final String emotionState;

  /// Intensity bucket: 'low', 'mid', or 'high'.
  final String emotionIntensity;

  /// Optional weather condition forwarded to [WeatherOverlay] and
  /// [SceneBackground].  Pass null for clear-sky rendering.
  final String? weatherOverlay;

  /// Diameter of the lobster body in logical pixels.
  final double lobsterSize;

  const LobsterRenderer({
    super.key,
    required this.currentScene,
    required this.currentAction,
    required this.emotionState,
    required this.emotionIntensity,
    this.weatherOverlay,
    this.lobsterSize = 160,
  });

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        // Layer 1: Scene gradient + scene icon
        SceneBackground(
          scene: currentScene,
          weather: weatherOverlay,
        ),

        // Layer 2: Ambient bubbles
        const BubbleEffect(),

        // Layer 3: Lobster character
        Center(
          child: LobsterPlaceholder(
            emotion: emotionState,
            intensity: emotionIntensity,
            action: currentAction,
            size: lobsterSize,
          ),
        ),

        // Layer 4: Weather particles (conditional)
        if (weatherOverlay != null)
          WeatherOverlay(condition: weatherOverlay!),
      ],
    );
  }
}
