import 'dart:async';

import 'package:hive_flutter/hive_flutter.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import 'package:tangping_lobster/models/weather.dart';
import 'package:tangping_lobster/providers/api_providers.dart';
import 'package:tangping_lobster/services/ws_service.dart';

part 'weather_provider.g.dart';

const _hiveBoxName = 'weather';
const _hiveCacheKey = 'latest_weather';

/// Manages current weather and its effect on the lobster.
///
/// - Fetches weather for the provided [lat] / [lon] on first build.
/// - Caches the response in Hive for offline use.
/// - Auto-refreshes on [WsWeatherEvent].
/// - Manual refresh via [refresh].
@riverpod
class WeatherNotifier extends _$WeatherNotifier {
  late final Box<Map<dynamic, dynamic>> _box;
  StreamSubscription<WsEvent>? _wsSub;

  @override
  Future<WeatherResponse> build({
    required double lat,
    required double lon,
  }) async {
    _box = await Hive.openBox<Map<dynamic, dynamic>>(_hiveBoxName);

    final ws = ref.watch(webSocketServiceProvider);
    _wsSub = ws.events.listen(_handleWsEvent);
    ref.onDispose(() => _wsSub?.cancel());

    return _fetchAndCache(lat: lat, lon: lon);
  }

  // -------------------------------------------------------------------------
  // Public mutations
  // -------------------------------------------------------------------------

  /// Re-fetch weather for the given coordinates.
  Future<void> refresh({double? lat, double? lon}) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(
      () => _fetchAndCache(lat: lat ?? this.lat, lon: lon ?? this.lon),
    );
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  Future<WeatherResponse> _fetchAndCache({
    required double lat,
    required double lon,
  }) async {
    try {
      final api = ref.read(apiServiceProvider);
      final fresh = await api.getWeather(lat, lon);
      await _cache(fresh);
      return fresh;
    } catch (_) {
      final cached = _readCache();
      if (cached != null) return cached;
      rethrow;
    }
  }

  Future<void> _cache(WeatherResponse weather) async {
    await _box.put(
      _hiveCacheKey,
      Map<String, Object?>.from(weather.toJson()),
    );
  }

  WeatherResponse? _readCache() {
    final raw = _box.get(_hiveCacheKey);
    if (raw == null) return null;
    try {
      return WeatherResponse.fromJson(Map<String, Object?>.from(raw));
    } catch (_) {
      return null;
    }
  }

  void _handleWsEvent(WsEvent event) {
    if (event is! WsWeatherEvent) return;
    final current = state.valueOrNull;
    if (current == null) return;

    try {
      final merged = Map<String, Object?>.from(current.toJson())
        ..addAll(event.payload);
      final updated = WeatherResponse.fromJson(merged);
      state = AsyncData(updated);
      _cache(updated);
    } catch (_) {
      // Malformed patch — ignore.
    }
  }
}
