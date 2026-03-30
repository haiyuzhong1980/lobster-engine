// GENERATED CODE - DO NOT MODIFY BY HAND

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// ignore_for_file: type=lint
// ignore_for_file: subtype_of_sealed_class, invalid_use_of_internal_member, invalid_use_of_visible_for_testing_member

part of 'emotion_provider.dart';

String _$emotionNotifierHash() => r'emotion_notifier_hash';

@ProviderFor(EmotionNotifier)
const emotionNotifierProvider = EmotionNotifierFamily();

class EmotionNotifierFamily extends Family<AsyncValue<EmotionState>> {
  const EmotionNotifierFamily();

  EmotionNotifierProvider call(String lobsterId) =>
      EmotionNotifierProvider(lobsterId);

  @override
  EmotionNotifierProvider getProviderOverride(
          covariant EmotionNotifierProvider provider) =>
      call(provider.lobsterId);

  static const Iterable<ProviderOrFamily>? _dependencies = null;

  @override
  Iterable<ProviderOrFamily>? get dependencies => _dependencies;

  static const Iterable<ProviderOrFamily>? _allTransitiveDependencies = null;

  @override
  Iterable<ProviderOrFamily>? get allTransitiveDependencies =>
      _allTransitiveDependencies;

  @override
  String? get name => r'emotionNotifierProvider';
}

class EmotionNotifierProvider
    extends AsyncNotifierProviderImpl<EmotionNotifier, EmotionState> {
  const EmotionNotifierProvider(
    String lobsterId, {
    super.name,
    super.dependencies,
  })  : this.lobsterId = lobsterId,
        super(
          () => EmotionNotifier()..lobsterId = lobsterId,
          from: emotionNotifierProvider,
          argument: lobsterId,
          debugGetCreateSourceHash:
              const bool.fromEnvironment('dart.vm.product')
                  ? null
                  : _$emotionNotifierHash,
        );

  final String lobsterId;

  @override
  AsyncValue<EmotionState> runNotifierBuild(EmotionNotifier notifier) =>
      notifier.build(lobsterId);
}
