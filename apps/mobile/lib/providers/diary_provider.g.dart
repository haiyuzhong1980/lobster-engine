// GENERATED CODE - DO NOT MODIFY BY HAND

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// ignore_for_file: type=lint
// ignore_for_file: subtype_of_sealed_class, invalid_use_of_internal_member, invalid_use_of_visible_for_testing_member

part of 'diary_provider.dart';

// DiaryLatestNotifier

String _$diaryLatestNotifierHash() => r'diary_latest_notifier_hash';

@ProviderFor(DiaryLatestNotifier)
const diaryLatestNotifierProvider = DiaryLatestNotifierFamily();

class DiaryLatestNotifierFamily
    extends Family<AsyncValue<DiaryEntry?>> {
  const DiaryLatestNotifierFamily();

  DiaryLatestNotifierProvider call(String lobsterId) =>
      DiaryLatestNotifierProvider(lobsterId);

  @override
  DiaryLatestNotifierProvider getProviderOverride(
          covariant DiaryLatestNotifierProvider provider) =>
      call(provider.lobsterId);

  static const Iterable<ProviderOrFamily>? _dependencies = null;

  @override
  Iterable<ProviderOrFamily>? get dependencies => _dependencies;

  static const Iterable<ProviderOrFamily>? _allTransitiveDependencies = null;

  @override
  Iterable<ProviderOrFamily>? get allTransitiveDependencies =>
      _allTransitiveDependencies;

  @override
  String? get name => r'diaryLatestNotifierProvider';
}

class DiaryLatestNotifierProvider
    extends AsyncNotifierProviderImpl<DiaryLatestNotifier, DiaryEntry?> {
  const DiaryLatestNotifierProvider(
    String lobsterId, {
    super.name,
    super.dependencies,
  })  : this.lobsterId = lobsterId,
        super(
          () => DiaryLatestNotifier()..lobsterId = lobsterId,
          from: diaryLatestNotifierProvider,
          argument: lobsterId,
          debugGetCreateSourceHash:
              const bool.fromEnvironment('dart.vm.product')
                  ? null
                  : _$diaryLatestNotifierHash,
        );

  final String lobsterId;

  @override
  AsyncValue<DiaryEntry?> runNotifierBuild(DiaryLatestNotifier notifier) =>
      notifier.build(lobsterId);
}

// DiaryTimelineNotifier

String _$diaryTimelineNotifierHash() => r'diary_timeline_notifier_hash';

@ProviderFor(DiaryTimelineNotifier)
const diaryTimelineNotifierProvider = DiaryTimelineNotifierFamily();

class DiaryTimelineNotifierFamily
    extends Family<AsyncValue<List<DiaryEntry>>> {
  const DiaryTimelineNotifierFamily();

  DiaryTimelineNotifierProvider call(String lobsterId) =>
      DiaryTimelineNotifierProvider(lobsterId);

  @override
  DiaryTimelineNotifierProvider getProviderOverride(
          covariant DiaryTimelineNotifierProvider provider) =>
      call(provider.lobsterId);

  static const Iterable<ProviderOrFamily>? _dependencies = null;

  @override
  Iterable<ProviderOrFamily>? get dependencies => _dependencies;

  static const Iterable<ProviderOrFamily>? _allTransitiveDependencies = null;

  @override
  Iterable<ProviderOrFamily>? get allTransitiveDependencies =>
      _allTransitiveDependencies;

  @override
  String? get name => r'diaryTimelineNotifierProvider';
}

class DiaryTimelineNotifierProvider extends AsyncNotifierProviderImpl<
    DiaryTimelineNotifier, List<DiaryEntry>> {
  const DiaryTimelineNotifierProvider(
    String lobsterId, {
    super.name,
    super.dependencies,
  })  : this.lobsterId = lobsterId,
        super(
          () => DiaryTimelineNotifier()..lobsterId = lobsterId,
          from: diaryTimelineNotifierProvider,
          argument: lobsterId,
          debugGetCreateSourceHash:
              const bool.fromEnvironment('dart.vm.product')
                  ? null
                  : _$diaryTimelineNotifierHash,
        );

  final String lobsterId;

  @override
  AsyncValue<List<DiaryEntry>> runNotifierBuild(
          DiaryTimelineNotifier notifier) =>
      notifier.build(lobsterId);
}
