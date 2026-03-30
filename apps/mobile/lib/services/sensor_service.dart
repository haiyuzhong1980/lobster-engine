// ignore_for_file: lines_longer_than_80_chars

import 'dart:async';
import 'dart:math' as math;

import 'package:geolocator/geolocator.dart';
import 'package:sensors_plus/sensors_plus.dart';

import 'package:tangping_lobster/models/activity.dart';

// ---------------------------------------------------------------------------
// Public data model
// ---------------------------------------------------------------------------

/// Immutable snapshot of fused sensor state at a moment in time.
///
/// [type] uses the shared [SensorActivityType] from the model layer so it can
/// be forwarded directly to [ActivityReport] without conversion.
class ActivityReading {
  /// Creates an [ActivityReading].
  const ActivityReading({
    required this.type,
    required this.confidence,
    required this.timestamp,
    this.speed,
    this.steps,
    this.altitude,
  });

  /// Detected activity, expressed in the canonical [SensorActivityType].
  final SensorActivityType type;

  /// Classifier confidence in the range 0.0–1.0.
  final double confidence;

  /// Ground speed in km/h, or null when GPS is unavailable.
  final double? speed;

  /// Cumulative step count since midnight, or null before first step event.
  final int? steps;

  /// Altitude above sea level in metres, or null when GPS is unavailable.
  final double? altitude;

  /// Wall-clock time at which this reading was produced.
  final DateTime timestamp;

  /// Returns a copy of this reading with the supplied fields replaced.
  ActivityReading copyWith({
    SensorActivityType? type,
    double? confidence,
    DateTime? timestamp,
    double? speed,
    int? steps,
    double? altitude,
  }) =>
      ActivityReading(
        type: type ?? this.type,
        confidence: confidence ?? this.confidence,
        timestamp: timestamp ?? this.timestamp,
        speed: speed ?? this.speed,
        steps: steps ?? this.steps,
        altitude: altitude ?? this.altitude,
      );

  @override
  String toString() =>
      'ActivityReading(type: $type, confidence: '
      '${confidence.toStringAsFixed(2)}, speed: $speed, '
      'steps: $steps, altitude: $altitude, timestamp: $timestamp)';
}

// ---------------------------------------------------------------------------
// Internal fine-grained classification (not exposed publicly)
// ---------------------------------------------------------------------------

/// High-resolution activity categories used by [SensorService._classifyActivity].
///
/// These are richer than [SensorActivityType] (e.g. they distinguish plane
/// from train from driving) so that the confidence scorer has more signal.
/// They are mapped down to [SensorActivityType] before being emitted.
enum _DetailedActivity {
  stationary,
  sleeping,
  eating,
  walking,
  running,
  cycling,
  driving,
  bus,
  subway,
  train,
  plane,
  boat,
  phoneCall,
  listeningMusic,
  charging,
}

/// Maps an internal [_DetailedActivity] to the canonical [SensorActivityType].
SensorActivityType _toPublicType(_DetailedActivity detail) => switch (detail) {
      _DetailedActivity.stationary => SensorActivityType.stationary,
      _DetailedActivity.sleeping => SensorActivityType.resting,
      _DetailedActivity.eating => SensorActivityType.stationary,
      _DetailedActivity.walking => SensorActivityType.walking,
      _DetailedActivity.running => SensorActivityType.running,
      _DetailedActivity.cycling => SensorActivityType.cycling,
      _DetailedActivity.driving => SensorActivityType.transit,
      _DetailedActivity.bus => SensorActivityType.transit,
      _DetailedActivity.subway => SensorActivityType.transit,
      _DetailedActivity.train => SensorActivityType.transit,
      _DetailedActivity.plane => SensorActivityType.transit,
      _DetailedActivity.boat => SensorActivityType.transit,
      _DetailedActivity.phoneCall => SensorActivityType.indoorActive,
      _DetailedActivity.listeningMusic => SensorActivityType.stationary,
      _DetailedActivity.charging => SensorActivityType.resting,
    };

// ---------------------------------------------------------------------------
// Internal sliding-window accumulator
// ---------------------------------------------------------------------------

class _AccelWindow {
  _AccelWindow({required this.capacity});

  final int capacity;
  final List<double> _magnitudes = [];

  void add(double magnitude) {
    _magnitudes.add(magnitude);
    if (_magnitudes.length > capacity) {
      _magnitudes.removeAt(0);
    }
  }

  bool get isFull => _magnitudes.length >= capacity;

  double get mean {
    if (_magnitudes.isEmpty) return 0;
    var sum = 0.0;
    for (final m in _magnitudes) {
      sum += m;
    }
    return sum / _magnitudes.length;
  }

  /// Population variance of the window — used to detect movement vs. rest.
  double get variance {
    if (_magnitudes.length < 2) return 0;
    final avg = mean;
    var sumSq = 0.0;
    for (final m in _magnitudes) {
      final diff = m - avg;
      sumSq += diff * diff;
    }
    return sumSq / _magnitudes.length;
  }
}

// ---------------------------------------------------------------------------
// Zero-crossing step-frequency tracker
// ---------------------------------------------------------------------------

class _StepFrequencyTracker {
  // Rolling window of 20 samples at 10 Hz = 2 seconds.
  static const _windowSize = 20;

  final List<double> _magnitudes = [];
  int _zeroCrossings = 0;

  void add(double magnitude) {
    if (_magnitudes.length >= _windowSize) {
      _magnitudes.removeAt(0);
    }
    _magnitudes.add(magnitude);
    _recalculate();
  }

  void _recalculate() {
    _zeroCrossings = 0;
    if (_magnitudes.length < 2) return;
    final avg = _average;
    for (var i = 1; i < _magnitudes.length; i++) {
      final prev = _magnitudes[i - 1] - avg;
      final curr = _magnitudes[i] - avg;
      if (prev < 0 && curr >= 0) _zeroCrossings++;
    }
  }

  double get _average {
    var s = 0.0;
    for (final v in _magnitudes) {
      s += v;
    }
    return s / _magnitudes.length;
  }

  /// Estimated step frequency in Hz (zero-crossings per second).
  double get frequencyHz => _zeroCrossings / 2.0;
}

// ---------------------------------------------------------------------------
// Public service
// ---------------------------------------------------------------------------

/// Fuses accelerometer, gyroscope, GPS, and step-counter data to classify
/// the user's current physical activity.
///
/// The output [ActivityReading.type] uses [ActivityType] from
/// `models/activity.dart` so results can be forwarded directly to
/// [ApiService.reportActivity] without further conversion.
///
/// Usage:
/// ```dart
/// final svc = SensorService();
/// svc.activityStream.listen((reading) => print(reading));
/// await svc.start();
/// // Wire step count from StepCounterService:
/// stepSvc.stepsStream.listen(svc.updateStepCount);
/// // ...
/// await svc.stop();
/// svc.dispose();
/// ```
class SensorService {
  // ---- sensor subscriptions ------------------------------------------------

  StreamSubscription<AccelerometerEvent>? _accelerometerSub;
  StreamSubscription<GyroscopeEvent>? _gyroscopeSub;
  StreamSubscription<Position>? _locationSub;

  // ---- output stream -------------------------------------------------------

  final StreamController<ActivityReading> _activityController =
      StreamController<ActivityReading>.broadcast();

  /// Emits a new [ActivityReading] whenever the detected activity changes
  /// with confidence above the minimum threshold.
  Stream<ActivityReading> get activityStream => _activityController.stream;

  // ---- internal state -----------------------------------------------------

  _DetailedActivity _currentDetail = _DetailedActivity.stationary;
  double _currentConfidence = 0.0;

  // Updated externally via updateStepCount() — fed from StepCounterService.
  int _stepCount = 0;

  double? _currentSpeed; // km/h
  double? _currentAltitude; // metres

  // System-event overlays.
  bool _isCharging = false;
  bool _hasHeadphones = false;
  bool _isInCall = false;

  // Fusion helpers.
  final _AccelWindow _accelWindow = _AccelWindow(capacity: 30);
  final _StepFrequencyTracker _stepFreq = _StepFrequencyTracker();

  // Fusion runs at 10 Hz (every 100 ms) regardless of sensor sample rate.
  Timer? _fusionTimer;

  // ---- read-only snapshot --------------------------------------------------

  /// The most recently computed [ActivityReading].
  ActivityReading get currentReading => ActivityReading(
        type: _toPublicType(_currentDetail),
        confidence: _currentConfidence,
        timestamp: DateTime.now(),
        speed: _currentSpeed,
        steps: _stepCount,
        altitude: _currentAltitude,
      );

  // ---- lifecycle -----------------------------------------------------------

  /// Requests location permission, then starts all sensors and the fusion
  /// timer.
  Future<void> start() async {
    await _requestLocationPermission();
    _startAccelerometer();
    _startGyroscope();
    _startGps();
    _fusionTimer = Timer.periodic(
      const Duration(milliseconds: 100),
      (_) => _runFusion(),
    );
  }

  /// Pauses all sensors and cancels the fusion timer.
  Future<void> stop() async {
    _fusionTimer?.cancel();
    _fusionTimer = null;
    await _accelerometerSub?.cancel();
    await _gyroscopeSub?.cancel();
    await _locationSub?.cancel();
    _accelerometerSub = null;
    _gyroscopeSub = null;
    _locationSub = null;
  }

  /// Stops sensors and closes the output stream.
  void dispose() {
    // stop() is async; fire-and-forget is intentional — the stream controller
    // is closed synchronously below, preventing further event emissions.
    unawaited(stop());
    if (!_activityController.isClosed) {
      _activityController.close();
    }
  }

  // ---- external state updates ---------------------------------------------

  /// Updates the step count embedded in future [ActivityReading] snapshots.
  ///
  /// Wire this to [StepCounterService.stepsStream]:
  /// ```dart
  /// stepSvc.stepsStream.listen(sensorSvc.updateStepCount);
  /// ```
  // ignore: use_setters_to_change_properties
  void updateStepCount(int steps) {
    _stepCount = steps;
  }

  /// Updates the charging state from a platform battery event.
  // ignore: use_setters_to_change_properties
  void setCharging({required bool isCharging}) {
    _isCharging = isCharging;
  }

  /// Updates the headphone state from an audio route change event.
  // ignore: use_setters_to_change_properties
  void setHeadphones({required bool hasHeadphones}) {
    _hasHeadphones = hasHeadphones;
  }

  /// Updates the in-call state from a telephony event.
  // ignore: use_setters_to_change_properties
  void setInCall({required bool isInCall}) {
    _isInCall = isInCall;
  }

  // ---- sensor initialisation ----------------------------------------------

  Future<void> _requestLocationPermission() async {
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    // Proceed regardless; GPS data will simply be absent when denied.
  }

  void _startAccelerometer() {
    // sensors_plus 5.x top-level function; SensorInterval.normalInterval
    // typically delivers ~50–100 Hz depending on hardware.  The fusion timer
    // downsamples the output to 10 Hz, saving CPU and battery.
    _accelerometerSub = accelerometerEventStream(
      samplingPeriod: SensorInterval.normalInterval,
    ).listen(
      _onAccelerometerEvent,
      onError: (_) {/* sensor unavailable — degrade gracefully */},
      cancelOnError: false,
    );
  }

  void _startGyroscope() {
    // Gyroscope subscription keeps the sensor warm for future disambiguation
    // between vehicle vibration and pedestrian motion.  The data is not yet
    // consumed in the decision tree.
    _gyroscopeSub = gyroscopeEventStream(
      samplingPeriod: SensorInterval.normalInterval,
    ).listen(
      (_) {},
      onError: (_) {/* sensor unavailable — degrade gracefully */},
      cancelOnError: false,
    );
  }

  void _startGps() {
    const settings = LocationSettings(
      accuracy: LocationAccuracy.medium,
      // Only fire an update after ≥10 m movement; reduces CPU and radio
      // wake-ups while walking.
      distanceFilter: 10,
      timeLimit: Duration(seconds: 30),
    );
    _locationSub = Geolocator.getPositionStream(locationSettings: settings)
        .listen(
          _onPositionUpdate,
          onError: (_) {/* GPS unavailable — degrade gracefully */},
          cancelOnError: false,
        );
  }

  // ---- raw sensor callbacks -----------------------------------------------

  void _onAccelerometerEvent(AccelerometerEvent event) {
    final magnitude =
        math.sqrt(event.x * event.x + event.y * event.y + event.z * event.z);
    _accelWindow.add(magnitude);
    _stepFreq.add(magnitude);
  }

  void _onPositionUpdate(Position position) {
    // geolocator returns speed in m/s; convert to km/h.
    _currentSpeed = (position.speed * 3.6).clamp(0.0, double.infinity);
    _currentAltitude = position.altitude;
  }

  // ---- fusion loop --------------------------------------------------------

  void _runFusion() {
    if (!_accelWindow.isFull) return; // warm-up: wait for 30 samples

    final newDetail = _classifyActivity(
      accelerometerMagnitude: _accelWindow.mean,
      accelVariance: _accelWindow.variance,
      speed: _currentSpeed ?? 0.0,
      stepFrequency: _stepFreq.frequencyHz,
      isCharging: _isCharging,
      hasHeadphones: _hasHeadphones,
      isInCall: _isInCall,
    );

    final confidence = _computeConfidence(
      detail: newDetail,
      hasGps: _currentSpeed != null,
      accelVariance: _accelWindow.variance,
    );

    _maybeUpdateActivity(newDetail, confidence);
  }

  // ---- decision tree (pure function) -------------------------------------

  /// Classifies the current activity from fused sensor inputs.
  ///
  /// Priority order (highest wins):
  ///   1. System-event overlays: charging, in-call
  ///   2. Speed-based vehicle tiers (plane → train → driving → bus)
  ///   3. Underground heuristic (GPS lost while previously in transit)
  ///   4. Step-pattern locomotion (running / walking / cycling)
  ///   5. Stationary contextual (sleeping / eating)
  ///   6. Headphone music overlay (only when completely still)
  ///   7. Default stationary
  ///
  /// The [hasHeadphones] flag is treated as a low-priority overlay that only
  /// fires when no locomotion or vehicle cue is present, so walking with
  /// headphones is still reported as walking.
  _DetailedActivity _classifyActivity({
    required double accelerometerMagnitude,
    required double accelVariance,
    required double speed, // km/h
    required double stepFrequency, // Hz
    required bool isCharging,
    required bool hasHeadphones,
    required bool isInCall,
  }) {
    // 1 — system overlays
    if (isCharging) return _DetailedActivity.charging;
    if (isInCall) return _DetailedActivity.phoneCall;

    // 2 — speed-based vehicle tiers
    if (speed > 500) return _DetailedActivity.plane;
    if (speed > 150) return _DetailedActivity.train;
    if (speed > 30 && stepFrequency < 0.5) return _DetailedActivity.driving;

    // Bus: moderate speed + no walking pattern + smooth ride
    if (speed > 10 && stepFrequency < 0.5 && accelVariance < 1.0) {
      return _DetailedActivity.bus;
    }

    // Cycling: moderate speed, no meaningful step cadence
    if (speed > 10 && stepFrequency < 0.8) return _DetailedActivity.cycling;

    // 3 — GPS-lost subway heuristic: maintain subway until GPS returns
    if (_currentSpeed == null && _currentDetail == _DetailedActivity.subway) {
      return _DetailedActivity.subway;
    }

    // 4 — step-based locomotion
    if (stepFrequency >= 2.5) return _DetailedActivity.running;
    if (stepFrequency >= 1.5) return _DetailedActivity.walking;

    // 5 — stationary contextual (time-of-day hints)
    final hour = DateTime.now().hour;
    final isNighttime = hour >= 22 || hour < 6;
    final isMealtime = (hour >= 7 && hour <= 9) ||
        (hour >= 11 && hour <= 13) ||
        (hour >= 17 && hour <= 19);

    // Device flat on a surface near gravity confirms complete rest.
    final nearGravity = (accelerometerMagnitude - 9.81).abs() < 0.5;
    if (accelVariance < 0.05 && nearGravity) {
      if (isNighttime) return _DetailedActivity.sleeping;
      if (isMealtime) return _DetailedActivity.eating;
    }

    // 6 — headphone music overlay (still + headphones → listeningMusic)
    if (hasHeadphones && accelVariance < 0.3) {
      return _DetailedActivity.listeningMusic;
    }

    // 7 — default
    return _DetailedActivity.stationary;
  }

  // ---- confidence scorer -------------------------------------------------

  double _computeConfidence({
    required _DetailedActivity detail,
    required bool hasGps,
    required double accelVariance,
  }) {
    const gpsDependentActivities = {
      _DetailedActivity.driving,
      _DetailedActivity.bus,
      _DetailedActivity.train,
      _DetailedActivity.plane,
      _DetailedActivity.cycling,
    };

    if (gpsDependentActivities.contains(detail)) {
      return hasGps ? 0.85 : 0.55;
    }

    if (detail == _DetailedActivity.running ||
        detail == _DetailedActivity.walking) {
      return (0.6 + (accelVariance.clamp(0.0, 1.0) * 0.3)).clamp(0.0, 1.0);
    }

    if (detail == _DetailedActivity.charging ||
        detail == _DetailedActivity.phoneCall) {
      return 1.0; // system-event overlays are always certain
    }

    if (detail == _DetailedActivity.sleeping ||
        detail == _DetailedActivity.eating) {
      return accelVariance < 0.02 ? 0.80 : 0.60;
    }

    return 0.70; // stationary / listeningMusic / cycling fallback
  }

  // ---- state update guard ------------------------------------------------

  /// Emits a new reading only when confidence exceeds 70 % AND the detailed
  /// activity has changed.  Prevents noisy activity-bouncing.
  void _maybeUpdateActivity(_DetailedActivity newDetail, double confidence) {
    const minConfidence = 0.70;
    if (confidence < minConfidence) return;
    if (newDetail == _currentDetail) return;

    _currentDetail = newDetail;
    _currentConfidence = confidence;

    if (!_activityController.isClosed) {
      _activityController.add(currentReading);
    }
  }
}
