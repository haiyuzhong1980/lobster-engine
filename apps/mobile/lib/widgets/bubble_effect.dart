import 'dart:math' as math;

import 'package:flutter/material.dart';

// ---------------------------------------------------------------------------
// Bubble data model (immutable)
// ---------------------------------------------------------------------------

@immutable
class _Bubble {
  /// Normalised x position (0–1 of screen width).
  final double x;

  /// Normalised y position (0–1 of screen height). 0 = top, 1 = bottom.
  final double y;

  /// Physical radius in logical pixels.
  final double radius;

  /// Rise speed in normalised units per second.
  final double speed;

  /// Horizontal sway phase offset.
  final double swayPhase;

  /// Sway amplitude in normalised units.
  final double swayAmplitude;

  /// Opacity (0.0–1.0).
  final double opacity;

  const _Bubble({
    required this.x,
    required this.y,
    required this.radius,
    required this.speed,
    required this.swayPhase,
    required this.swayAmplitude,
    required this.opacity,
  });

  /// Returns a new [_Bubble] advanced by [dt] seconds.
  _Bubble tick(double dt) {
    // Bubbles rise upward; wrap at the top to re-emerge from the bottom.
    final nextY = y - speed * dt;
    final wrappedY = nextY < -0.05 ? 1.05 : nextY;
    return _Bubble(
      x: x,
      y: wrappedY,
      radius: radius,
      speed: speed,
      swayPhase: swayPhase,
      swayAmplitude: swayAmplitude,
      opacity: opacity,
    );
  }
}

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

/// Ambient underwater bubble layer.
///
/// Spawns between 10 and 20 bubbles that rise slowly from the bottom to the
/// top of the screen.  Each bubble sways gently on a sinusoidal path.
/// The layer ignores all pointer events so it never blocks interactions.
class BubbleEffect extends StatefulWidget {
  /// Total number of ambient bubbles.
  final int count;

  const BubbleEffect({super.key, this.count = 15});

  @override
  State<BubbleEffect> createState() => _BubbleEffectState();
}

class _BubbleEffectState extends State<BubbleEffect>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late List<_Bubble> _bubbles;
  final math.Random _rng = math.Random(7);

  double _lastValue = 0.0;

  @override
  void initState() {
    super.initState();
    _bubbles = _spawnBubbles(widget.count);
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 1),
    )..repeat();
    _controller.addListener(_onTick);
  }

  List<_Bubble> _spawnBubbles(int count) {
    return List.generate(count, (_) => _Bubble(
      x: _rng.nextDouble(),
      y: _rng.nextDouble(), // scatter initial positions across the full height
      radius: 3.0 + _rng.nextDouble() * 9.0,
      speed: 0.015 + _rng.nextDouble() * 0.035,
      swayPhase: _rng.nextDouble() * math.pi * 2,
      swayAmplitude: 0.005 + _rng.nextDouble() * 0.012,
      opacity: 0.12 + _rng.nextDouble() * 0.28,
    ));
  }

  void _onTick() {
    if (!mounted) return;
    final raw = _controller.value;
    final dt = (raw - _lastValue).abs();
    final safeDt = dt > 0.5 ? (1.0 - dt) : dt;
    _lastValue = raw;

    setState(() {
      _bubbles = _bubbles.map((b) => b.tick(safeDt)).toList();
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
    return IgnorePointer(
      child: CustomPaint(
        painter: _BubblePainter(
          bubbles: _bubbles,
          animationValue: _controller.value,
        ),
        child: const SizedBox.expand(),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Painter
// ---------------------------------------------------------------------------

class _BubblePainter extends CustomPainter {
  final List<_Bubble> bubbles;
  final double animationValue;

  const _BubblePainter({
    required this.bubbles,
    required this.animationValue,
  });

  @override
  void paint(Canvas canvas, Size size) {
    for (final bubble in bubbles) {
      // Apply horizontal sway
      final swayOffset = math.sin(
            animationValue * math.pi * 2 * 2 + bubble.swayPhase,
          ) *
          bubble.swayAmplitude *
          size.width;

      final cx = bubble.x * size.width + swayOffset;
      final cy = bubble.y * size.height;

      // Outer ring
      final ringPaint = Paint()
        ..color = Colors.white.withOpacity(bubble.opacity)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.2;
      canvas.drawCircle(Offset(cx, cy), bubble.radius, ringPaint);

      // Inner fill (very subtle)
      final fillPaint = Paint()
        ..color = Colors.white.withOpacity(bubble.opacity * 0.25)
        ..style = PaintingStyle.fill;
      canvas.drawCircle(Offset(cx, cy), bubble.radius, fillPaint);

      // Specular highlight (top-left arc)
      final highlightPaint = Paint()
        ..color = Colors.white.withOpacity(bubble.opacity * 0.7)
        ..style = PaintingStyle.fill;
      canvas.drawCircle(
        Offset(cx - bubble.radius * 0.28, cy - bubble.radius * 0.28),
        bubble.radius * 0.25,
        highlightPaint,
      );
    }
  }

  @override
  bool shouldRepaint(_BubblePainter old) =>
      old.animationValue != animationValue;
}
