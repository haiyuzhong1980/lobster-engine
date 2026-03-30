import 'dart:async';

import 'package:hive_flutter/hive_flutter.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import 'package:tangping_lobster/models/social_relation.dart';
import 'package:tangping_lobster/providers/api_providers.dart';
import 'package:tangping_lobster/providers/lobster_provider.dart';
import 'package:tangping_lobster/services/ws_service.dart';

part 'social_provider.g.dart';

const _hiveBoxName = 'social';
const _hiveRelationsKey = 'relations_';
const _hiveGroupsKey = 'groups_';

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

/// Manages the social relations list for a lobster.
///
/// - Fetches from API on first build.
/// - Caches in Hive.
/// - Updates on [WsSocialEvent] with event types 'gift.received',
///   'relation.confirmed', 'relation.updated'.
@riverpod
class SocialRelationsNotifier extends _$SocialRelationsNotifier {
  late final Box<List<dynamic>> _box;
  StreamSubscription<WsEvent>? _wsSub;

  @override
  Future<List<SocialRelation>> build(String lobsterId) async {
    _box = await Hive.openBox<List<dynamic>>(_hiveBoxName);

    final ws = ref.watch(webSocketServiceProvider);
    _wsSub = ws.events.listen(_handleWsEvent);
    ref.onDispose(() => _wsSub?.cancel());

    return _fetchAndCache(lobsterId);
  }

  // -------------------------------------------------------------------------
  // Public mutations
  // -------------------------------------------------------------------------

  /// Send a gift to [receiverId] and refresh the local shell balance.
  Future<GiftResult> sendGift({
    required String receiverId,
    required String giftType,
    required int cost,
  }) async {
    final api = ref.read(apiServiceProvider);
    final result = await api.sendGift(lobsterId, receiverId, giftType, cost);
    if (result.success) {
      // Invalidate lobster state so shell balance refreshes.
      ref.invalidate(lobsterNotifierProvider(lobsterId));
    }
    return result;
  }

  /// Confirm a relation with [peerId].
  Future<ConfirmResult> confirmRelation(String peerId) async {
    final api = ref.read(apiServiceProvider);
    final result = await api.confirmRelation(lobsterId, peerId);
    if (result.success && result.relation != null) {
      _upsertRelation(result.relation!);
    }
    return result;
  }

  /// Re-fetch all relations.
  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => _fetchAndCache(lobsterId));
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  Future<List<SocialRelation>> _fetchAndCache(String id) async {
    try {
      final api = ref.read(apiServiceProvider);
      final fresh = await api.getRelations(id);
      await _cacheRelations(fresh);
      return fresh;
    } catch (_) {
      final cached = _readRelationsCache(id);
      if (cached != null) return cached;
      rethrow;
    }
  }

  Future<void> _cacheRelations(List<SocialRelation> relations) async {
    final serialised = relations.map((r) => r.toJson()).toList();
    await _box.put('$_hiveRelationsKey$lobsterId', serialised);
  }

  List<SocialRelation>? _readRelationsCache(String id) {
    final raw = _box.get('$_hiveRelationsKey$id');
    if (raw == null) return null;
    try {
      return raw
          .whereType<Map<dynamic, dynamic>>()
          .map((m) => SocialRelation.fromJson(Map<String, Object?>.from(m)))
          .toList();
    } catch (_) {
      return null;
    }
  }

  void _upsertRelation(SocialRelation updated) {
    final current = state.valueOrNull ?? [];
    final idx = current.indexWhere((r) => r.peerId == updated.peerId);
    final newList = List<SocialRelation>.from(current);
    if (idx >= 0) {
      newList[idx] = updated;
    } else {
      newList.add(updated);
    }
    state = AsyncData(newList);
    _cacheRelations(newList);
  }

  void _handleWsEvent(WsEvent event) {
    if (event is! WsSocialEvent) return;

    switch (event.eventType) {
      case 'relation.updated':
      case 'relation.confirmed':
        try {
          final relation = SocialRelation.fromJson(event.payload);
          if (relation.lobsterId != lobsterId) return;
          _upsertRelation(relation);
        } catch (_) {}

      case 'gift.received':
        // Refresh relations after a gift — tier may have upgraded.
        refresh();

      default:
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Group effects
// ---------------------------------------------------------------------------

/// Manages active [GroupEffect]s for a geographic area.
@riverpod
class GroupEffectsNotifier extends _$GroupEffectsNotifier {
  late final Box<List<dynamic>> _box;

  @override
  Future<List<GroupEffect>> build({String? geoHash}) async {
    _box = await Hive.openBox<List<dynamic>>(_hiveBoxName);
    return _fetchAndCache(geoHash: geoHash);
  }

  Future<void> refresh({String? geoHash}) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(
      () => _fetchAndCache(geoHash: geoHash ?? this.geoHash),
    );
  }

  Future<List<GroupEffect>> _fetchAndCache({String? geoHash}) async {
    try {
      final api = ref.read(apiServiceProvider);
      final fresh = await api.getGroups(geoHash: geoHash);
      await _cacheGroups(fresh, geoHash: geoHash);
      return fresh;
    } catch (_) {
      final cached = _readGroupsCache(geoHash: geoHash);
      if (cached != null) return cached;
      rethrow;
    }
  }

  String _cacheKey({String? geoHash}) =>
      '$_hiveGroupsKey${geoHash ?? 'global'}';

  Future<void> _cacheGroups(
    List<GroupEffect> groups, {
    String? geoHash,
  }) async {
    final serialised = groups.map((g) => g.toJson()).toList();
    await _box.put(_cacheKey(geoHash: geoHash), serialised);
  }

  List<GroupEffect>? _readGroupsCache({String? geoHash}) {
    final raw = _box.get(_cacheKey(geoHash: geoHash));
    if (raw == null) return null;
    try {
      return raw
          .whereType<Map<dynamic, dynamic>>()
          .map((m) => GroupEffect.fromJson(Map<String, Object?>.from(m)))
          .toList();
    } catch (_) {
      return null;
    }
  }
}
