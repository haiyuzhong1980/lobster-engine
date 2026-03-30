import 'dart:math' as math;

import 'package:flutter/material.dart';

// ---------------------------------------------------------------------------
// Emotion types mirrored as a simple string enum for widget-layer consumption.
// The full EmotionType lives in models/; widgets accept strings so they stay
// decoupled from generated freezed code.
// ---------------------------------------------------------------------------

/// Emotion-specific rendering parameters for the lobster painter.
@immutable
class _EmotionParams {
  /// Vertical offset multiplier applied to the bob animation (0 = none).
  final double bobAmplitude;

  /// Cycles-per-second for the idle bob.
  final double bobFrequency;

  /// Eye openness ratio (0 = fully closed, 1 = fully open).
  final double eyeOpenness;

  /// Whether to draw a smile curve beneath the eyes.
  final bool showSmile;

  /// Whether to draw a subtle circular glow behind the body.
  final bool showZenGlow;

  /// Antenna angle in radians relative to vertical (0 = upright).
  final double antennaAngle;

  const _EmotionParams({
    required this.bobAmplitude,
    required this.bobFrequency,
    required this.eyeOpenness,
    required this.showSmile,
    required this.showZenGlow,
    required this.antennaAngle,
  });
}

// ---------------------------------------------------------------------------
// Stateful widget
// ---------------------------------------------------------------------------

/// Animated lobster placeholder drawn entirely with [CustomPaint].
///
/// The lobster idles with a gentle sine-wave bob at ~0.5 Hz.
/// The visual style adapts to [emotion] and [intensity].
class LobsterPlaceholder extends StatefulWidget {
  /// Emotion key matching [_emotionParams] keys.
  final String emotion;

  /// Intensity bucket: 'low', 'mid', 'high'.
  final String intensity;

  /// Current action label displayed beneath the lobster.
  final String action;

  /// Rendered size of the lobster body (diameter in logical pixels).
  final double size;

  const LobsterPlaceholder({
    super.key,
    required this.emotion,
    required this.intensity,
    required this.action,
    this.size = 160,
  });

  // ---------------------------------------------------------------------------
  // Emotion parameter table
  // ---------------------------------------------------------------------------

  static const Map<String, _EmotionParams> _emotionParams = {
    'happy': _EmotionParams(
      bobAmplitude: 8,
      bobFrequency: 0.8,
      eyeOpenness: 0.25, // squinty smile
      showSmile: true,
      showZenGlow: false,
      antennaAngle: 0.18,
    ),
    'sleepy': _EmotionParams(
      bobAmplitude: 4,
      bobFrequency: 0.3,
      eyeOpenness: 0.1, // nearly closed
      showSmile: false,
      showZenGlow: false,
      antennaAngle: 0.35, // drooping antennae
    ),
    'curious': _EmotionParams(
      bobAmplitude: 6,
      bobFrequency: 0.5,
      eyeOpenness: 0.75,
      showSmile: false,
      showZenGlow: false,
      antennaAngle: 0.12,
    ),
    'hungry': _EmotionParams(
      bobAmplitude: 7,
      bobFrequency: 0.6,
      eyeOpenness: 0.65,
      showSmile: false,
      showZenGlow: false,
      antennaAngle: 0.20,
    ),
    'warm': _EmotionParams(
      bobAmplitude: 5,
      bobFrequency: 0.45,
      eyeOpenness: 0.5,
      showSmile: true,
      showZenGlow: false,
      antennaAngle: 0.15,
    ),
    'proud': _EmotionParams(
      bobAmplitude: 6,
      bobFrequency: 0.55,
      eyeOpenness: 0.6,
      showSmile: false,
      showZenGlow: false,
      antennaAngle: 0.08, // raised proudly
    ),
    'surprised': _EmotionParams(
      bobAmplitude: 3,
      bobFrequency: 0.5,
      eyeOpenness: 1.0, // wide open
      showSmile: false,
      showZenGlow: false,
      antennaAngle: 0.0, // straight up
    ),
    'zen': _EmotionParams(
      bobAmplitude: 3,
      bobFrequency: 0.25,
      eyeOpenness: 0.0, // closed
      showSmile: false,
      showZenGlow: true,
      antennaAngle: 0.10,
    ),
    // Default / chill
    'chill': _EmotionParams(
      bobAmplitude: 5,
      bobFrequency: 0.5,
      eyeOpenness: 0.45,
      showSmile: false,
      showZenGlow: false,
      antennaAngle: 0.20,
    ),
    'stressed': _EmotionParams(
      bobAmplitude: 9,
      bobFrequency: 1.0,
      eyeOpenness: 0.70,
      showSmile: false,
      showZenGlow: false,
      antennaAngle: 0.30,
    ),
    'lonely': _EmotionParams(
      bobAmplitude: 4,
      bobFrequency: 0.35,
      eyeOpenness: 0.40,
      showSmile: false,
      showZenGlow: false,
      antennaAngle: 0.28,
    ),
    'focused': _EmotionParams(
      bobAmplitude: 2,
      bobFrequency: 0.4,
      eyeOpenness: 0.80,
      showSmile: false,
      showZenGlow: false,
      antennaAngle: 0.05,
    ),
    'excited': _EmotionParams(
      bobAmplitude: 12,
      bobFrequency: 1.2,
      eyeOpenness: 0.90,
      showSmile: true,
      showZenGlow: false,
      antennaAngle: 0.0,
    ),
  };

  static _EmotionParams _resolveParams(String emotion) =>
      _emotionParams[emotion] ?? _emotionParams['chill']!;

  /// Scale the bob amplitude by intensity.
  static double _intensityScale(String intensity) {
    switch (intensity) {
      case 'low':
        return 0.5;
      case 'high':
        return 1.5;
      default:
        return 1.0; // 'mid'
    }
  }

  @override
  State<LobsterPlaceholder> createState() => _LobsterPlaceholderState();
}

class _LobsterPlaceholderState extends State<LobsterPlaceholder>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 4),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final params = LobsterPlaceholder._resolveParams(widget.emotion);
    final scale = LobsterPlaceholder._intensityScale(widget.intensity);

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        final phase = _controller.value * 2 * math.pi;
        final bobOffset = math.sin(phase * params.bobFrequency * 4) *
            params.bobAmplitude *
            scale;

        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Transform.translate(
              offset: Offset(0, bobOffset),
              child: CustomPaint(
                size: Size(widget.size, widget.size),
                painter: _LobsterPainter(
                  params: params,
                  animationValue: _controller.value,
                ),
              ),
            ),
            const SizedBox(height: 12),
            _ActionLabel(action: widget.action),
          ],
        );
      },
    );
  }
}

// ---------------------------------------------------------------------------
// CustomPainter
// ---------------------------------------------------------------------------

class _LobsterPainter extends CustomPainter {
  final _EmotionParams params;
  final double animationValue;

  const _LobsterPainter({
    required this.params,
    required this.animationValue,
  });

  // Brand coral body colour
  static const Color _bodyColor = Color(0xFFE87461);
  static const Color _bodyShade = Color(0xFFC95E4C);
  static const Color _clawColor = Color(0xFFD0604F);
  static const Color _eyeWhite = Color(0xFFF7FFF7);
  static const Color _eyePupil = Color(0xFF2B2D42);
  static const Color _zenGlow = Color(0x4095E1D3); // teal glow

  @override
  void paint(Canvas canvas, Size size) {
    final cx = size.width / 2;
    final cy = size.height / 2;

    // 1. Optional zen glow
    if (params.showZenGlow) {
      _drawZenGlow(canvas, Offset(cx, cy), size.width * 0.55);
    }

    // 2. Left claw
    _drawClaw(canvas, cx, cy, size, isLeft: true);

    // 3. Right claw
    _drawClaw(canvas, cx, cy, size, isLeft: false);

    // 4. Body (round coral)
    _drawBody(canvas, Offset(cx, cy), size.width * 0.38);

    // 5. Eyes
    _drawEyes(canvas, Offset(cx, cy), size.width * 0.38);

    // 6. Antennae
    _drawAntennae(canvas, Offset(cx, cy), size.width * 0.38);

    // 7. Optional smile
    if (params.showSmile) {
      _drawSmile(canvas, Offset(cx, cy), size.width * 0.38);
    }
  }

  void _drawZenGlow(Canvas canvas, Offset center, double radius) {
    final paint = Paint()
      ..shader = RadialGradient(
        colors: [_zenGlow, Colors.transparent],
      ).createShader(
        Rect.fromCircle(center: center, radius: radius * 1.5),
      );
    canvas.drawCircle(center, radius * 1.5, paint);
  }

  void _drawBody(Canvas canvas, Offset center, double radius) {
    // Body shadow
    final shadowPaint = Paint()
      ..color = Colors.black26
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8);
    canvas.drawCircle(center.translate(2, 4), radius, shadowPaint);

    // Main body fill
    final bodyPaint = Paint()..color = _bodyColor;
    canvas.drawCircle(center, radius, bodyPaint);

    // Subtle highlight
    final highlightPaint = Paint()
      ..shader = RadialGradient(
        center: const Alignment(-0.3, -0.4),
        radius: 0.7,
        colors: [
          Colors.white.withOpacity(0.25),
          Colors.transparent,
        ],
      ).createShader(
        Rect.fromCircle(center: center, radius: radius),
      );
    canvas.drawCircle(center, radius, highlightPaint);

    // Shell segment lines
    final segmentPaint = Paint()
      ..color = _bodyShade
      ..strokeWidth = 1.5
      ..style = PaintingStyle.stroke;
    for (int i = 1; i <= 3; i++) {
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        math.pi * (0.05 + 0.05 * i),
        math.pi * (0.9 - 0.1 * i),
        false,
        segmentPaint,
      );
    }
  }

  void _drawClaw(Canvas canvas, double cx, double cy, Size size,
      {required bool isLeft}) {
    final sign = isLeft ? -1.0 : 1.0;
    final bodyRadius = size.width * 0.38;
    final armBaseX = cx + sign * bodyRadius * 0.75;
    final armBaseY = cy + bodyRadius * 0.1;

    final path = Path();

    // Upper arm
    final armEndX = cx + sign * bodyRadius * 1.55;
    final armEndY = cy - bodyRadius * 0.2;

    // Lower claw tip
    final clawTopX = armEndX + sign * bodyRadius * 0.3;
    final clawTopY = armEndY - bodyRadius * 0.35;
    final clawBotX = armEndX + sign * bodyRadius * 0.25;
    final clawBotY = armEndY + bodyRadius * 0.20;

    path.moveTo(armBaseX, armBaseY);
    path.quadraticBezierTo(
      cx + sign * bodyRadius * 1.2, cy - bodyRadius * 0.05,
      armEndX, armEndY,
    );
    path.lineTo(clawTopX, clawTopY);
    path.lineTo(clawBotX, clawBotY);
    path.close();

    final clawPaint = Paint()
      ..color = _clawColor
      ..style = PaintingStyle.fill;
    canvas.drawPath(path, clawPaint);

    final outlinePaint = Paint()
      ..color = _bodyShade
      ..strokeWidth = 1.5
      ..style = PaintingStyle.stroke;
    canvas.drawPath(path, outlinePaint);
  }

  void _drawEyes(Canvas canvas, Offset bodyCenter, double bodyRadius) {
    final eyeOffsetX = bodyRadius * 0.35;
    final eyeOffsetY = -bodyRadius * 0.15;
    final eyeRadius = bodyRadius * 0.22;

    for (final sign in [-1.0, 1.0]) {
      final eyeCenter = bodyCenter.translate(sign * eyeOffsetX, eyeOffsetY);

      // White sclera
      final scleraPaint = Paint()..color = _eyeWhite;
      canvas.drawCircle(eyeCenter, eyeRadius, scleraPaint);

      // Eyelid mask (top-down based on openness)
      final lidHeight = eyeRadius * 2 * (1.0 - params.eyeOpenness.clamp(0.0, 1.0));
      if (lidHeight > 0) {
        final lidPaint = Paint()..color = _bodyColor;
        canvas.drawRect(
          Rect.fromLTWH(
            eyeCenter.dx - eyeRadius,
            eyeCenter.dy - eyeRadius,
            eyeRadius * 2,
            lidHeight,
          ),
          lidPaint,
        );
      }

      // Pupil (only visible when eye is sufficiently open)
      if (params.eyeOpenness > 0.15) {
        final pupilPaint = Paint()..color = _eyePupil;
        canvas.drawCircle(
          eyeCenter.translate(0, eyeRadius * 0.1),
          eyeRadius * 0.5 * params.eyeOpenness.clamp(0.2, 1.0),
          pupilPaint,
        );
      }

      // Eye outline
      final outlinePaint = Paint()
        ..color = _bodyShade
        ..strokeWidth = 1.0
        ..style = PaintingStyle.stroke;
      canvas.drawCircle(eyeCenter, eyeRadius, outlinePaint);
    }
  }

  void _drawAntennae(Canvas canvas, Offset bodyCenter, double bodyRadius) {
    final antennaPaint = Paint()
      ..color = _bodyShade
      ..strokeWidth = 2.0
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    final baseY = bodyCenter.dy - bodyRadius * 0.85;

    for (final sign in [-1.0, 1.0]) {
      final baseX = bodyCenter.dx + sign * bodyRadius * 0.22;
      // Apply angle: positive angle = outward lean
      final tipX = baseX + sign * bodyRadius * 1.3 * math.sin(params.antennaAngle);
      final tipY = baseY - bodyRadius * 1.1 * math.cos(params.antennaAngle);

      // Small animation: subtle sway
      final swayPhase = animationValue * 2 * math.pi;
      final sway = math.sin(swayPhase + sign * 0.5) * bodyRadius * 0.05;

      canvas.drawLine(
        Offset(baseX, baseY),
        Offset(tipX + sway, tipY),
        antennaPaint,
      );
    }
  }

  void _drawSmile(Canvas canvas, Offset bodyCenter, double bodyRadius) {
    final smilePaint = Paint()
      ..color = _bodyShade
      ..strokeWidth = 2.5
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    final smileRect = Rect.fromCenter(
      center: bodyCenter.translate(0, bodyRadius * 0.30),
      width: bodyRadius * 0.6,
      height: bodyRadius * 0.25,
    );

    canvas.drawArc(smileRect, 0.15, math.pi * 0.7, false, smilePaint);
  }

  @override
  bool shouldRepaint(_LobsterPainter oldDelegate) =>
      oldDelegate.animationValue != animationValue ||
      oldDelegate.params != params;
}

// ---------------------------------------------------------------------------
// Action label
// ---------------------------------------------------------------------------

class _ActionLabel extends StatelessWidget {
  final String action;

  const _ActionLabel({required this.action});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.black38,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        action,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 13,
          fontWeight: FontWeight.w500,
          letterSpacing: 0.3,
        ),
      ),
    );
  }
}
