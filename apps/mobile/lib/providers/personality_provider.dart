import 'package:hive_flutter/hive_flutter.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import 'package:tangping_lobster/models/personality_dna.dart';
import 'package:tangping_lobster/providers/api_providers.dart';

part 'personality_provider.g.dart';

const _hiveBoxName = 'personality';
const _hiveKeyPrefix = 'personality_';

/// Manages the [PersonalityDna] for a single lobster.
///
/// - Fetches from the /personality endpoint on first build.
/// - Caches the result in Hive for offline use.
/// - Exposes [refresh] for manual re-fetch after evolution events.
@riverpod
class PersonalityNotifier extends _$PersonalityNotifier {
  late final Box<Map<dynamic, dynamic>> _box;

  @override
  Future<PersonalityDna> build(String lobsterId) async {
    _box = await Hive.openBox<Map<dynamic, dynamic>>(_hiveBoxName);
    return _fetchAndCache(lobsterId);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /// Re-fetch the personality DNA from the server.
  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => _fetchAndCache(lobsterId));
  }

  /// Returns the dominant [PersonalityArchetype] or null if loading.
  PersonalityArchetype? get archetype =>
      state.valueOrNull?.archetype;

  /// Returns all traits, or an empty list if loading.
  List<PersonalityTrait> get traits =>
      state.valueOrNull?.traits ?? const [];

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  Future<PersonalityDna> _fetchAndCache(String id) async {
    try {
      final api = ref.read(apiServiceProvider);
      final fresh = await api.getPersonality(id);
      await _cache(fresh);
      return fresh;
    } catch (_) {
      final cached = _readCache(id);
      if (cached != null) return cached;
      rethrow;
    }
  }

  Future<void> _cache(PersonalityDna dna) async {
    await _box.put(
      '$_hiveKeyPrefix$lobsterId',
      Map<String, Object?>.from(dna.toJson()),
    );
  }

  PersonalityDna? _readCache(String id) {
    final raw = _box.get('$_hiveKeyPrefix$id');
    if (raw == null) return null;
    try {
      return PersonalityDna.fromJson(Map<String, Object?>.from(raw));
    } catch (_) {
      return null;
    }
  }
}
