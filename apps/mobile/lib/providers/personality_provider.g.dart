// GENERATED CODE - DO NOT MODIFY BY HAND

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// ignore_for_file: type=lint
// ignore_for_file: subtype_of_sealed_class, invalid_use_of_internal_member, invalid_use_of_visible_for_testing_member

part of 'personality_provider.dart';

String _$personalityNotifierHash() => r'personality_notifier_hash';

@ProviderFor(PersonalityNotifier)
const personalityNotifierProvider = PersonalityNotifierFamily();

class PersonalityNotifierFamily extends Family<AsyncValue<PersonalityDna>> {
  const PersonalityNotifierFamily();

  PersonalityNotifierProvider call(String lobsterId) =>
      PersonalityNotifierProvider(lobsterId);

  @override
  PersonalityNotifierProvider getProviderOverride(
          covariant PersonalityNotifierProvider provider) =>
      call(provider.lobsterId);

  static const Iterable<ProviderOrFamily>? _dependencies = null;

  @override
  Iterable<ProviderOrFamily>? get dependencies => _dependencies;

  static const Iterable<ProviderOrFamily>? _allTransitiveDependencies = null;

  @override
  Iterable<ProviderOrFamily>? get allTransitiveDependencies =>
      _allTransitiveDependencies;

  @override
  String? get name => r'personalityNotifierProvider';
}

class PersonalityNotifierProvider
    extends AsyncNotifierProviderImpl<PersonalityNotifier, PersonalityDna> {
  const PersonalityNotifierProvider(
    String lobsterId, {
    super.name,
    super.dependencies,
  })  : this.lobsterId = lobsterId,
        super(
          () => PersonalityNotifier()..lobsterId = lobsterId,
          from: personalityNotifierProvider,
          argument: lobsterId,
          debugGetCreateSourceHash:
              const bool.fromEnvironment('dart.vm.product')
                  ? null
                  : _$personalityNotifierHash,
        );

  final String lobsterId;

  @override
  AsyncValue<PersonalityDna> runNotifierBuild(PersonalityNotifier notifier) =>
      notifier.build(lobsterId);
}
