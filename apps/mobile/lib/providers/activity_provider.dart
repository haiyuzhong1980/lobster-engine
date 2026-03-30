import 'dart:async';
import 'dart:math' as math;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sensors_plus/sensors_plus.dart';

import 'package:tangping_lobster/models/activity.dart';
import 'package:tangping_lobster/providers/api_providers.dart';

/// Report debounce — we only send to the server when activity changes
/// or every [_serverReportInterval].
const _serverReportInterval = Duration(minutes: 1);

/// Window over which accelerometer samples are averaged.
const _sensorWindowSize = 20;

/// Magnitude threshold below which activity is classified as
/// [SensorActivityType.stationary].
const _stationaryThreshold = 0.8;

/// Magnitude threshold above which activity is classified as
/// [SensorActivityType.running].
const _runningThreshold = 6.0;

/// Manages the live [SensorState] for a lobster using on-device sensors.
///
/// - Subscribes to accelerometer events from `sensors_plus`.
/// - Classifies motion based on magnitude window.
/// - Reports to the server on activity transitions and periodically.
class ActivityNotifier extends FamilyNotifier<SensorState, String> {
  StreamSubscription<AccelerometerEvent>? _sensorSub;
  Timer? _reportTimer;

  final List<double> _magnitudeWindow = [];
  SensorActivityType _lastReportedActivity = SensorActivityType.unknown;

  @override
  SensorState build(String lobsterId) {
    _startSensors();
    ref.onDispose(_stopSensors);
    return const SensorState();
  }

  // -------------------------------------------------------------------------
  // Public mutations
  // -------------------------------------------------------------------------

  /// Force a manual sensor activity report to the server.
  Future<void> reportToServer() async {
    final current = state;
    await _sendReport(current.current, current.confidence);
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  void _startSensors() {
    _sensorSub = accelerometerEventStream(
      samplingPeriod: SensorInterval.normalInterval,
    ).listen(_onAccelerometerEvent);

    _reportTimer = Timer.periodic(_serverReportInterval, (_) {
      _sendReport(state.current, state.confidence);
    });
  }

  void _stopSensors() {
    _sensorSub?.cancel();
    _sensorSub = null;
    _reportTimer?.cancel();
    _reportTimer = null;
  }

  void _onAccelerometerEvent(AccelerometerEvent event) {
    final magnitude = math.sqrt(
      event.x * event.x + event.y * event.y + event.z * event.z,
    );

    // Subtract gravity (approx 9.8 m/s²) to get net acceleration.
    final netMagnitude = (magnitude - 9.8).abs();

    _magnitudeWindow.add(netMagnitude);
    if (_magnitudeWindow.length > _sensorWindowSize) {
      _magnitudeWindow.removeAt(0);
    }

    final avg = _magnitudeWindow.isEmpty
        ? 0.0
        : _magnitudeWindow.reduce((a, b) => a + b) / _magnitudeWindow.length;

    final (activity, confidence) = _classify(avg);
    final now = DateTime.now().toIso8601String();

    state = state.copyWith(
      current: activity,
      confidence: confidence,
      accelerometerMagnitude: avg,
      lastUpdatedAt: now,
    );

    // Report on transition.
    if (activity != _lastReportedActivity) {
      _lastReportedActivity = activity;
      _sendReport(activity, confidence);
    }
  }

  (SensorActivityType, double) _classify(double avg) {
    if (avg < _stationaryThreshold) {
      return (
        SensorActivityType.stationary,
        _confidence(avg, 0, _stationaryThreshold)
      );
    }
    if (avg < 2.5) {
      return (
        SensorActivityType.walking,
        0.7 + (avg - _stationaryThreshold) / 10
      );
    }
    if (avg < _runningThreshold) {
      return (SensorActivityType.indoorActive, 0.6);
    }
    return (
      SensorActivityType.running,
      _confidence(avg, _runningThreshold, 15)
    );
  }

  double _confidence(double value, double min, double max) {
    final ratio = (value - min) / (max - min);
    return ratio.clamp(0.0, 1.0);
  }

  Future<void> _sendReport(
      SensorActivityType activity, double confidence) async {
    try {
      final api = ref.read(apiServiceProvider);
      await api.reportActivity(
        arg,
        activity.name,
        confidence,
        metadata: {
          'accelerometerMagnitude': state.accelerometerMagnitude,
        },
      );
    } catch (_) {
      // Silently ignore network errors for sensor reporting.
    }
  }
}

/// Family provider for [ActivityNotifier].
final activityNotifierProvider =
    NotifierProviderFamily<ActivityNotifier, SensorState, String>(
  ActivityNotifier.new,
);
