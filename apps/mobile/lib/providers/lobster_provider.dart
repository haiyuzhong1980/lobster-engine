import 'dart:async';

import 'package:hive_flutter/hive_flutter.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import 'package:tangping_lobster/models/lobster_state.dart';
import 'package:tangping_lobster/providers/api_providers.dart';
import 'package:tangping_lobster/services/ws_service.dart';

part 'lobster_provider.g.dart';

const _hiveBoxName = 'lobster_state';
const _hiveKeyPrefix = 'lobster_';

/// Manages the full [LobsterState] for a single lobster identified by [id].
///
/// - Fetches from API on first build.
/// - Caches the latest state in Hive for offline use.
/// - Auto-refreshes whenever a [WsLobsterUpdateEvent] arrives for this lobster.
@riverpod
class LobsterNotifier extends _$LobsterNotifier {
  late final Box<Map<dynamic, dynamic>> _box;
  StreamSubscription<WsEvent>? _wsSub;

  @override
  Future<LobsterState> build(String id) async {
    _box = await Hive.openBox<Map<dynamic, dynamic>>(_hiveBoxName);

    // Subscribe to real-time updates for this lobster.
    final ws = ref.watch(webSocketServiceProvider);
    _wsSub = ws.events.listen(_handleWsEvent);
    ref.onDispose(() => _wsSub?.cancel());

    return _fetchAndCache(id);
  }

  // -------------------------------------------------------------------------
  // Public mutations
  // -------------------------------------------------------------------------

  /// Re-fetch the lobster state from the server, then cache it.
  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => _fetchAndCache(id));
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  Future<LobsterState> _fetchAndCache(String lobsterId) async {
    try {
      final api = ref.read(apiServiceProvider);
      final fresh = await api.getLobsterState(lobsterId);
      await _cache(fresh);
      return fresh;
    } catch (_) {
      // Attempt to serve from local cache on network failure.
      final cached = _readCache(lobsterId);
      if (cached != null) return cached;
      rethrow;
    }
  }

  Future<void> _cache(LobsterState lobsterState) async {
    await _box.put(
      '$_hiveKeyPrefix${lobsterState.id}',
      Map<String, Object?>.from(lobsterState.toJson()),
    );
  }

  LobsterState? _readCache(String lobsterId) {
    final raw = _box.get('$_hiveKeyPrefix$lobsterId');
    if (raw == null) return null;
    try {
      return LobsterState.fromJson(Map<String, Object?>.from(raw));
    } catch (_) {
      return null;
    }
  }

  void _handleWsEvent(WsEvent event) {
    if (event is! WsLobsterUpdateEvent) return;
    if (event.lobsterId != id) return;

    // Merge server patch into the current state.
    final current = state.valueOrNull;
    if (current == null) return;

    try {
      final merged = Map<String, Object?>.from(current.toJson())
        ..addAll(event.payload);
      final updated = LobsterState.fromJson(merged);
      state = AsyncData(updated);
      _cache(updated);
    } catch (_) {
      // Malformed patch — ignore.
    }
  }
}

/// Convenience provider that registers a new lobster and returns its state.
///
/// This is a one-shot [FutureProvider] — call it from UI with `ref.read`.
@riverpod
Future<LobsterState> registerLobster(
  RegisterLobsterRef ref, {
  required String name,
  required String ownerId,
}) async {
  final api = ref.read(apiServiceProvider);
  return api.registerLobster(name, ownerId);
}
