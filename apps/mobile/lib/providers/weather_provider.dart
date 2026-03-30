import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';

import 'package:tangping_lobster/models/weather.dart';
import 'package:tangping_lobster/providers/api_providers.dart';
import 'package:tangping_lobster/services/ws_service.dart';

const _hiveBoxName = 'weather';
const _hiveCacheKey = 'latest_weather';

/// Parameter record for [WeatherNotifier].
typedef WeatherArg = ({double lat, double lon});

/// Manages current weather and its effect on the lobster.
///
/// - Fetches weather for the provided [lat] / [lon] on first build.
/// - Caches the response in Hive for offline use.
/// - Auto-refreshes on [WsWeatherEvent].
/// - Manual refresh via [refresh].
class WeatherNotifier
    extends FamilyAsyncNotifier<WeatherResponse, WeatherArg> {
  late final Box<Map<dynamic, dynamic>> _box;
  StreamSubscription<WsEvent>? _wsSub;

  @override
  Future<WeatherResponse> build(WeatherArg params) async {
    _box = await Hive.openBox<Map<dynamic, dynamic>>(_hiveBoxName);

    final ws = ref.watch(webSocketServiceProvider);
    _wsSub = ws.events.listen(_handleWsEvent);
    ref.onDispose(() => _wsSub?.cancel());

    return _fetchAndCache(lat: params.lat, lon: params.lon);
  }

  // -------------------------------------------------------------------------
  // Public mutations
  // -------------------------------------------------------------------------

  /// Re-fetch weather for the given coordinates.
  Future<void> refresh({double? lat, double? lon}) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(
      () => _fetchAndCache(
        lat: lat ?? arg.lat,
        lon: lon ?? arg.lon,
      ),
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

/// Family provider for [WeatherNotifier] parameterised by lat/lon record.
final weatherNotifierProvider =
    AsyncNotifierProviderFamily<WeatherNotifier, WeatherResponse, WeatherArg>(
  WeatherNotifier.new,
);
