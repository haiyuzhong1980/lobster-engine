// ignore_for_file: lines_longer_than_80_chars

import 'dart:async';

import 'package:shared_preferences/shared_preferences.dart';

// ---------------------------------------------------------------------------
// Storage key constants (file-private).
// ---------------------------------------------------------------------------

const String _kDailyStepsKey = 'step_counter_daily_steps';
const String _kLastResetDateKey = 'step_counter_last_reset_date';

/// Tracks the user's daily step count, resets at midnight, and persists the
/// count across app restarts via [SharedPreferences].
///
/// Usage:
/// ```dart
/// final svc = StepCounterService();
/// await svc.initialize();
/// svc.stepsStream.listen((steps) => print('Steps today: $steps'));
/// // Feed raw step events from sensors_plus or platform pedometer:
/// svc.addSteps(delta: 1);
/// // …
/// svc.dispose();
/// ```
class StepCounterService {
  // ---- state ---------------------------------------------------------------

  int _dailySteps = 0;
  late DateTime _lastResetDate;

  /// The accumulated step count since the most recent midnight reset.
  int get dailySteps => _dailySteps;

  // ---- persistence ---------------------------------------------------------

  SharedPreferences? _prefs;

  // ---- output stream -------------------------------------------------------

  final StreamController<int> _stepsController =
      StreamController<int>.broadcast();

  /// Emits the updated daily step count on every [addSteps] call.
  Stream<int> get stepsStream => _stepsController.stream;

  // ---- midnight reset timer -----------------------------------------------

  Timer? _midnightTimer;

  // ---- lifecycle -----------------------------------------------------------

  /// Loads persisted data and schedules the next midnight reset.
  Future<void> initialize() async {
    _prefs = await SharedPreferences.getInstance();
    await _loadFromStorage();
    _scheduleMidnightReset();
  }

  /// Cancels the reset timer and closes the output stream.
  void dispose() {
    _midnightTimer?.cancel();
    _midnightTimer = null;
    if (!_stepsController.isClosed) {
      _stepsController.close();
    }
  }

  // ---- public API ----------------------------------------------------------

  /// Adds [delta] steps to today's count and persists the new value.
  ///
  /// [delta] must be a positive integer.  A delta of 1 is the typical usage
  /// when relaying individual step events from the platform pedometer.
  void addSteps({required int delta}) {
    assert(delta > 0, 'delta must be positive');
    _ensureDateIsCurrent();
    _dailySteps += delta;
    _persistAsync();
    if (!_stepsController.isClosed) {
      _stepsController.add(_dailySteps);
    }
  }

  /// Resets the step count to zero and persists immediately.
  ///
  /// Called automatically at midnight; can also be invoked manually for
  /// testing or when the user explicitly resets their stats.
  Future<void> reset() async {
    _dailySteps = 0;
    _lastResetDate = _todayMidnight();
    await _persist();
    if (!_stepsController.isClosed) {
      _stepsController.add(_dailySteps);
    }
  }

  // ---- private helpers -----------------------------------------------------

  /// Checks whether the calendar date has changed since the last reset.
  /// If so, performs a synchronous in-memory reset before the step is counted.
  void _ensureDateIsCurrent() {
    if (!_isSameDay(_lastResetDate, DateTime.now())) {
      _dailySteps = 0;
      _lastResetDate = _todayMidnight();
      _scheduleMidnightReset(); // reschedule for the new day
    }
  }

  // ---- persistence --------------------------------------------------------

  Future<void> _loadFromStorage() async {
    final prefs = _prefs;
    if (prefs == null) return;

    final savedDate = prefs.getString(_kLastResetDateKey);
    if (savedDate != null) {
      _lastResetDate =
          DateTime.tryParse(savedDate) ?? _todayMidnight();
    } else {
      _lastResetDate = _todayMidnight();
    }

    // If the persisted date is from a previous calendar day, discard the
    // stored step count and start fresh.
    if (!_isSameDay(_lastResetDate, DateTime.now())) {
      _dailySteps = 0;
      _lastResetDate = _todayMidnight();
      await _persist();
    } else {
      _dailySteps = prefs.getInt(_kDailyStepsKey) ?? 0;
    }
  }

  /// Fire-and-forget persistence for hot-path use (e.g. every step event).
  void _persistAsync() {
    unawaited(_persist());
  }

  Future<void> _persist() async {
    final prefs = _prefs;
    if (prefs == null) return;
    await prefs.setInt(_kDailyStepsKey, _dailySteps);
    await prefs.setString(
      _kLastResetDateKey,
      _lastResetDate.toIso8601String(),
    );
  }

  // ---- midnight reset scheduling ------------------------------------------

  void _scheduleMidnightReset() {
    _midnightTimer?.cancel();

    final now = DateTime.now();
    final nextMidnight = DateTime(now.year, now.month, now.day + 1);
    final delay = nextMidnight.difference(now);

    _midnightTimer = Timer(delay, () => unawaited(_onMidnight()));
  }

  Future<void> _onMidnight() {
    return reset().then((_) => _scheduleMidnightReset());
  }

  // ---- date helpers -------------------------------------------------------

  static DateTime _todayMidnight() {
    final now = DateTime.now();
    return DateTime(now.year, now.month, now.day);
  }

  static bool _isSameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;
}
