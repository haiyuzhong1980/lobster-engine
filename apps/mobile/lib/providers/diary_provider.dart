import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';

import 'package:tangping_lobster/models/diary.dart';
import 'package:tangping_lobster/providers/api_providers.dart';

const _hiveBoxName = 'diary';
const _hiveLatestKey = 'diary_latest_';
const _hiveTimelineKey = 'diary_timeline_';

// ---------------------------------------------------------------------------
// Latest diary entry
// ---------------------------------------------------------------------------

/// Manages the most recent [DiaryEntry] for a lobster.
///
/// - Fetches from the /diary/latest endpoint on first build.
/// - Caches in Hive for offline use.
/// - [refresh] fetches both the latest entry and invalidates the timeline.
class DiaryLatestNotifier extends FamilyAsyncNotifier<DiaryEntry?, String> {
  late final Box<Map<dynamic, dynamic>> _box;

  @override
  Future<DiaryEntry?> build(String lobsterId) async {
    _box = await Hive.openBox<Map<dynamic, dynamic>>(_hiveBoxName);
    return _fetchAndCache(lobsterId);
  }

  // -------------------------------------------------------------------------
  // Public mutations
  // -------------------------------------------------------------------------

  /// Re-fetch the latest diary entry.
  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => _fetchAndCache(arg));
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  Future<DiaryEntry?> _fetchAndCache(String id) async {
    try {
      final api = ref.read(apiServiceProvider);
      final fresh = await api.getDiary(id);
      if (fresh != null) await _cacheLatest(fresh);
      return fresh;
    } catch (_) {
      final cached = _readLatestCache(id);
      // Return cached entry (may be null if never fetched).
      return cached;
    }
  }

  Future<void> _cacheLatest(DiaryEntry entry) async {
    await _box.put(
      '$_hiveLatestKey$arg',
      Map<String, Object?>.from(entry.toJson()),
    );
  }

  DiaryEntry? _readLatestCache(String id) {
    final raw = _box.get('$_hiveLatestKey$id');
    if (raw == null) return null;
    try {
      return DiaryEntry.fromJson(Map<String, Object?>.from(raw));
    } catch (_) {
      return null;
    }
  }
}

/// Family provider for [DiaryLatestNotifier].
final diaryLatestNotifierProvider =
    AsyncNotifierProviderFamily<DiaryLatestNotifier, DiaryEntry?, String>(
  DiaryLatestNotifier.new,
);

// ---------------------------------------------------------------------------
// Diary timeline (paginated)
// ---------------------------------------------------------------------------

/// Manages the paginated [DiaryTimeline] for a lobster.
///
/// - Loads the first page on build.
/// - Appends more entries when [loadNextPage] is called.
/// - Caches the accumulated entries in Hive.
class DiaryTimelineNotifier
    extends FamilyAsyncNotifier<List<DiaryEntry>, String> {
  late final Box<List<dynamic>> _box;
  int _currentPage = 1;
  bool _hasMore = true;

  static const int _pageSize = 20;

  @override
  Future<List<DiaryEntry>> build(String lobsterId) async {
    _box = await Hive.openBox<List<dynamic>>(_hiveBoxName);
    return _loadPage(page: 1, reset: true);
  }

  // -------------------------------------------------------------------------
  // Public mutations
  // -------------------------------------------------------------------------

  /// Load the next page of diary entries.
  Future<void> loadNextPage() async {
    if (!_hasMore) return;
    final nextEntries = await _loadPage(page: _currentPage + 1, reset: false);
    final current = state.valueOrNull ?? [];
    final combined = [...current, ...nextEntries];
    state = AsyncData(combined);
    await _cacheTimeline(combined);
  }

  /// Reset and reload from page 1.
  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(
      () => _loadPage(page: 1, reset: true),
    );
  }

  /// Whether more pages are available.
  bool get hasMore => _hasMore;

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  Future<List<DiaryEntry>> _loadPage({
    required int page,
    required bool reset,
  }) async {
    try {
      final api = ref.read(apiServiceProvider);
      final timeline = await api.getDiaryTimeline(
        arg,
        page: page,
        limit: _pageSize,
      );

      _currentPage = page;
      _hasMore = timeline.hasMore;

      if (reset) {
        await _cacheTimeline(timeline.entries);
        return timeline.entries;
      }
      return timeline.entries;
    } catch (_) {
      if (reset) {
        final cached = _readTimelineCache(arg);
        if (cached != null) {
          _hasMore = false;
          return cached;
        }
      }
      rethrow;
    }
  }

  Future<void> _cacheTimeline(List<DiaryEntry> entries) async {
    final serialised = entries.map((e) => e.toJson()).toList();
    await _box.put('$_hiveTimelineKey$arg', serialised);
  }

  List<DiaryEntry>? _readTimelineCache(String id) {
    final raw = _box.get('$_hiveTimelineKey$id');
    if (raw == null) return null;
    try {
      return raw
          .whereType<Map<dynamic, dynamic>>()
          .map((m) => DiaryEntry.fromJson(Map<String, Object?>.from(m)))
          .toList();
    } catch (_) {
      return null;
    }
  }
}

/// Family provider for [DiaryTimelineNotifier].
final diaryTimelineNotifierProvider =
    AsyncNotifierProviderFamily<DiaryTimelineNotifier, List<DiaryEntry>, String>(
  DiaryTimelineNotifier.new,
);
