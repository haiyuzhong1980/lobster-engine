import 'dart:math' as math;

import 'package:flutter/material.dart';

// ---------------------------------------------------------------------------
// Particle data models (immutable value objects)
// ---------------------------------------------------------------------------

@immutable
class _RainDrop {
  final double x;
  final double y;
  final double speed;
  final double length;
  final double opacity;

  const _RainDrop({
    required this.x,
    required this.y,
    required this.speed,
    required this.length,
    required this.opacity,
  });

  _RainDrop tick(double dt, double height) {
    final nextY = (y + speed * dt * 600) % (height + length);
    return _RainDrop(x: x, y: nextY, speed: speed, length: length, opacity: opacity);
  }
}

@immutable
class _SnowFlake {
  final double x;
  final double y;
  final double radius;
  final double speed;
  final double drift;
  final double phase;

  const _SnowFlake({
    required this.x,
    required this.y,
    required this.radius,
    required this.speed,
    required this.drift,
    required this.phase,
  });

  _SnowFlake tick(double dt, double width, double height) {
    final nextY = (y + speed * dt * 120) % (height + radius * 2);
    final nextX = x + math.sin(nextY / 80 + phase) * drift * dt * 60;
    return _SnowFlake(
      x: nextX % width,
      y: nextY,
      radius: radius,
      speed: speed,
      drift: drift,
      phase: phase,
    );
  }
}

@immutable
class _WindLine {
  final double x;
  final double y;
  final double length;
  final double speed;
  final double opacity;

  const _WindLine({
    required this.x,
    required this.y,
    required this.length,
    required this.speed,
    required this.opacity,
  });

  _WindLine tick(double dt, double width) {
    final nextX = (x - speed * dt * 400) % (width + length);
    return _WindLine(x: nextX, y: y, length: length, speed: speed, opacity: opacity);
  }
}

// ---------------------------------------------------------------------------
// Overlay widget
// ---------------------------------------------------------------------------

/// Full-screen particle overlay for weather conditions.
///
/// Supported [condition] values: 'rain', 'snow', 'wind', 'thunder', 'fog'.
/// Renders nothing for unknown/null conditions.
class WeatherOverlay extends StatefulWidget {
  final String condition;

  const WeatherOverlay({super.key, required this.condition});

  @override
  State<WeatherOverlay> createState() => _WeatherOverlayState();
}

class _WeatherOverlayState extends State<WeatherOverlay>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  final math.Random _rng = math.Random(42);

  late List<_RainDrop> _rainDrops;
  late List<_SnowFlake> _snowFlakes;
  late List<_WindLine> _windLines;

  // Thunder flash state
  double _thunderAlpha = 0.0;
  double _thunderTimer = 0.0;
  double _thunderInterval = 2.5;

  static const int _rainCount = 60;
  static const int _snowCount = 40;
  static const int _windCount = 20;

  @override
  void initState() {
    super.initState();
    _initParticles();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 1),
    )..repeat();
    _controller.addListener(_onTick);
  }

  void _initParticles() {
    _rainDrops = List.generate(_rainCount, (_) => _RainDrop(
      x: _rng.nextDouble(),
      y: _rng.nextDouble(),
      speed: 0.6 + _rng.nextDouble() * 0.8,
      length: 10 + _rng.nextDouble() * 14,
      opacity: 0.4 + _rng.nextDouble() * 0.4,
    ));

    _snowFlakes = List.generate(_snowCount, (_) => _SnowFlake(
      x: _rng.nextDouble(),
      y: _rng.nextDouble(),
      radius: 2 + _rng.nextDouble() * 4,
      speed: 0.2 + _rng.nextDouble() * 0.4,
      drift: 0.3 + _rng.nextDouble() * 0.5,
      phase: _rng.nextDouble() * math.pi * 2,
    ));

    _windLines = List.generate(_windCount, (_) => _WindLine(
      x: _rng.nextDouble(),
      y: _rng.nextDouble(),
      length: 30 + _rng.nextDouble() * 60,
      speed: 0.5 + _rng.nextDouble() * 1.0,
      opacity: 0.2 + _rng.nextDouble() * 0.35,
    ));
  }

  double _lastValue = 0.0;

  void _onTick() {
    if (!mounted) return;
    final dt = (_controller.value - _lastValue).abs();
    // Handle the wrap-around (value goes 1.0 → 0.0)
    final safeDt = dt > 0.5 ? (1.0 - dt) : dt;
    _lastValue = _controller.value;

    setState(() {
      if (widget.condition == 'rain') {
        _rainDrops = _rainDrops.map((d) => d.tick(safeDt, 1.0)).toList();
      } else if (widget.condition == 'snow') {
        _snowFlakes = _snowFlakes.map((f) => f.tick(safeDt, 1.0, 1.0)).toList();
      } else if (widget.condition == 'wind') {
        _windLines = _windLines.map((l) => l.tick(safeDt, 1.0)).toList();
      } else if (widget.condition == 'thunder') {
        _thunderTimer += safeDt;
        if (_thunderTimer >= _thunderInterval) {
          _thunderAlpha = 0.7;
          _thunderTimer = 0.0;
          _thunderInterval = 1.5 + _rng.nextDouble() * 3.0;
        } else {
          _thunderAlpha = (_thunderAlpha - safeDt * 5).clamp(0.0, 1.0);
        }
      }
    });
  }

  @override
  void dispose() {
    _controller.removeListener(_onTick);
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    switch (widget.condition) {
      case 'rain':
        return IgnorePointer(
          child: CustomPaint(
            painter: _RainPainter(drops: _rainDrops),
            child: const SizedBox.expand(),
          ),
        );
      case 'snow':
        return IgnorePointer(
          child: CustomPaint(
            painter: _SnowPainter(flakes: _snowFlakes),
            child: const SizedBox.expand(),
          ),
        );
      case 'wind':
        return IgnorePointer(
          child: CustomPaint(
            painter: _WindPainter(lines: _windLines),
            child: const SizedBox.expand(),
          ),
        );
      case 'thunder':
        return IgnorePointer(
          child: AnimatedOpacity(
            opacity: _thunderAlpha,
            duration: const Duration(milliseconds: 80),
            child: ColoredBox(
              color: const Color(0xFFE8E8FF),
              child: const SizedBox.expand(),
            ),
          ),
        );
      case 'fog':
        return IgnorePointer(
          child: ColoredBox(
            color: Colors.white.withOpacity(0.28),
            child: const SizedBox.expand(),
          ),
        );
      default:
        return const SizedBox.shrink();
    }
  }
}

// ---------------------------------------------------------------------------
// Painters
// ---------------------------------------------------------------------------

class _RainPainter extends CustomPainter {
  final List<_RainDrop> drops;

  const _RainPainter({required this.drops});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..strokeCap = StrokeCap.round
      ..strokeWidth = 1.5;

    for (final drop in drops) {
      paint.color = Color.fromRGBO(100, 170, 220, drop.opacity);
      final x = drop.x * size.width;
      final y = drop.y * size.height;
      canvas.drawLine(
        Offset(x, y),
        Offset(x - drop.length * 0.25, y + drop.length),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(_RainPainter old) => true;
}

class _SnowPainter extends CustomPainter {
  final List<_SnowFlake> flakes;

  const _SnowPainter({required this.flakes});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = Colors.white.withOpacity(0.85);

    for (final flake in flakes) {
      canvas.drawCircle(
        Offset(flake.x * size.width, flake.y * size.height),
        flake.radius,
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(_SnowPainter old) => true;
}

class _WindPainter extends CustomPainter {
  final List<_WindLine> lines;

  const _WindPainter({required this.lines});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..strokeCap = StrokeCap.round
      ..strokeWidth = 1.2;

    for (final line in lines) {
      paint.color = Colors.white.withOpacity(line.opacity);
      final x = line.x * size.width;
      final y = line.y * size.height;
      canvas.drawLine(Offset(x, y), Offset(x + line.length, y), paint);
    }
  }

  @override
  bool shouldRepaint(_WindPainter old) => true;
}
