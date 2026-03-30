import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';

import 'package:tangping_lobster/models/emotion_state.dart';
import 'package:tangping_lobster/providers/api_providers.dart';
import 'package:tangping_lobster/services/ws_service.dart';

const _hiveBoxName = 'emotion_state';
const _hiveKeyPrefix = 'emotion_';

/// Manages the [EmotionState] for a single lobster identified by [arg].
///
/// - Derives initial state from the lobster state endpoint.
/// - Listens for [WsLobsterUpdateEvent] to refresh emotion in real time.
/// - Exposes [triggerEmotion] to programmatically change the emotion.
class EmotionNotifier extends FamilyAsyncNotifier<EmotionState, String> {
  late final Box<Map<dynamic, dynamic>> _box;
  StreamSubscription<WsEvent>? _wsSub;

  @override
  Future<EmotionState> build(String lobsterId) async {
    _box = await Hive.openBox<Map<dynamic, dynamic>>(_hiveBoxName);

    final ws = ref.watch(webSocketServiceProvider);
    _wsSub = ws.events.listen(_handleWsEvent);
    ref.onDispose(() => _wsSub?.cancel());

    return _fetchAndCache(lobsterId);
  }

  // -------------------------------------------------------------------------
  // Public mutations
  // -------------------------------------------------------------------------

  /// Trigger an emotion change on the server and update local state.
  Future<void> triggerEmotion(String trigger) async {
    final api = ref.read(apiServiceProvider);
    final updated = await api.triggerEmotion(arg, trigger);
    state = AsyncData(updated);
    await _cache(updated);
  }

  /// Re-fetch the emotion from the lobster state endpoint.
  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => _fetchAndCache(arg));
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  Future<EmotionState> _fetchAndCache(String id) async {
    try {
      final api = ref.read(apiServiceProvider);
      // Emotion is embedded in the full lobster state response.
      final lobsterState = await api.getLobsterState(id);
      final emotion = lobsterState.emotion;
      await _cache(emotion);
      return emotion;
    } catch (_) {
      final cached = _readCache(id);
      if (cached != null) return cached;
      rethrow;
    }
  }

  Future<void> _cache(EmotionState emotion) async {
    await _box.put(
      '$_hiveKeyPrefix$arg',
      Map<String, Object?>.from(emotion.toJson()),
    );
  }

  EmotionState? _readCache(String id) {
    final raw = _box.get('$_hiveKeyPrefix$id');
    if (raw == null) return null;
    try {
      return EmotionState.fromJson(Map<String, Object?>.from(raw));
    } catch (_) {
      return null;
    }
  }

  void _handleWsEvent(WsEvent event) {
    if (event is! WsLobsterUpdateEvent) return;
    if (event.lobsterId != arg) return;

    final emotionPayload = event.payload['emotion'];
    if (emotionPayload is! Map<String, Object?>) return;

    final current = state.valueOrNull;
    if (current == null) return;

    try {
      final merged = Map<String, Object?>.from(current.toJson())
        ..addAll(emotionPayload);
      final updated = EmotionState.fromJson(merged);
      state = AsyncData(updated);
      _cache(updated);
    } catch (_) {
      // Malformed patch — ignore.
    }
  }
}

/// Family provider for [EmotionNotifier].
final emotionNotifierProvider =
    AsyncNotifierProviderFamily<EmotionNotifier, EmotionState, String>(
  EmotionNotifier.new,
);
