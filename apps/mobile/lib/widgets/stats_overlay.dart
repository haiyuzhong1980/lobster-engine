import 'dart:ui';

import 'package:flutter/material.dart';

/// Weather icon + temperature mapping.
@immutable
class _WeatherDisplay {
  final String icon;
  final Color iconColor;

  const _WeatherDisplay({required this.icon, required this.iconColor});
}

/// Top status bar showing weather info on the left and
/// lazy coin + shell balance on the right.
///
/// Renders as a frosted-glass pill pinned to the top of the screen.
class StatsOverlay extends StatelessWidget {
  /// Weather condition key (matches WeatherOverlay conditions).
  final String? weatherCondition;

  /// Temperature in degrees Celsius. Pass null to hide.
  final int? temperatureCelsius;

  /// Lazy-coin balance.
  final int lazyCoinBalance;

  /// Shell currency balance.
  final int shellBalance;

  const StatsOverlay({
    super.key,
    this.weatherCondition,
    this.temperatureCelsius,
    required this.lazyCoinBalance,
    required this.shellBalance,
  });

  // ---------------------------------------------------------------------------
  // Weather lookup
  // ---------------------------------------------------------------------------

  static const Map<String, _WeatherDisplay> _weatherMap = {
    'clear': _WeatherDisplay(icon: '☀️', iconColor: Color(0xFFFFE66D)),
    'sunny': _WeatherDisplay(icon: '☀️', iconColor: Color(0xFFFFE66D)),
    'cloudy': _WeatherDisplay(icon: '☁️', iconColor: Color(0xFFB9D7EA)),
    'rain': _WeatherDisplay(icon: '🌧️', iconColor: Color(0xFF4ECDC4)),
    'snow': _WeatherDisplay(icon: '❄️', iconColor: Color(0xFFD6E6F2)),
    'wind': _WeatherDisplay(icon: '💨', iconColor: Color(0xFF8D99AE)),
    'fog': _WeatherDisplay(icon: '🌫️', iconColor: Color(0xFFAAAAAA)),
    'thunder': _WeatherDisplay(icon: '⛈️', iconColor: Color(0xFFFFE66D)),
    'storm': _WeatherDisplay(icon: '🌪️', iconColor: Color(0xFF5C6B73)),
  };

  static const _WeatherDisplay _defaultWeather = _WeatherDisplay(
    icon: '🌊',
    iconColor: Color(0xFF4ECDC4),
  );

  static _WeatherDisplay _resolveWeather(String? condition) =>
      (condition != null ? _weatherMap[condition] : null) ?? _defaultWeather;

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: BoxDecoration(
                color: Colors.black.withOpacity(0.22),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: Colors.white.withOpacity(0.18),
                ),
              ),
              child: Row(
                children: [
                  // Left: weather block
                  _WeatherBlock(
                    display: _resolveWeather(weatherCondition),
                    temperatureCelsius: temperatureCelsius,
                  ),
                  const Spacer(),
                  // Right: currency block
                  _CurrencyBlock(
                    lazyCoinBalance: lazyCoinBalance,
                    shellBalance: shellBalance,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Sub-widgets
// ---------------------------------------------------------------------------

class _WeatherBlock extends StatelessWidget {
  final _WeatherDisplay display;
  final int? temperatureCelsius;

  const _WeatherBlock({
    required this.display,
    required this.temperatureCelsius,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(display.icon, style: const TextStyle(fontSize: 20)),
        if (temperatureCelsius != null) ...[
          const SizedBox(width: 6),
          Text(
            '${temperatureCelsius!}°C',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 15,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.3,
            ),
          ),
        ],
      ],
    );
  }
}

class _CurrencyBlock extends StatelessWidget {
  final int lazyCoinBalance;
  final int shellBalance;

  const _CurrencyBlock({
    required this.lazyCoinBalance,
    required this.shellBalance,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _CurrencyChip(
          icon: '🪙',
          value: lazyCoinBalance,
          color: const Color(0xFFFFE66D),
        ),
        const SizedBox(width: 10),
        _CurrencyChip(
          icon: '🐚',
          value: shellBalance,
          color: const Color(0xFF4ECDC4),
        ),
      ],
    );
  }
}

class _CurrencyChip extends StatelessWidget {
  final String icon;
  final int value;
  final Color color;

  const _CurrencyChip({
    required this.icon,
    required this.value,
    required this.color,
  });

  String _formatValue(int v) {
    if (v >= 1000000) return '${(v / 1000000).toStringAsFixed(1)}M';
    if (v >= 1000) return '${(v / 1000).toStringAsFixed(1)}K';
    return v.toString();
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(icon, style: const TextStyle(fontSize: 16)),
        const SizedBox(width: 4),
        Text(
          _formatValue(value),
          style: TextStyle(
            color: color,
            fontSize: 14,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.2,
          ),
        ),
      ],
    );
  }
}
