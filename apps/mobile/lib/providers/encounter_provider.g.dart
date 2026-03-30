// GENERATED CODE - DO NOT MODIFY BY HAND

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// ignore_for_file: type=lint
// ignore_for_file: subtype_of_sealed_class, invalid_use_of_internal_member, invalid_use_of_visible_for_testing_member

part of 'encounter_provider.dart';

String _$encounterNotifierHash() => r'encounter_notifier_hash';

@ProviderFor(EncounterNotifier)
const encounterNotifierProvider = EncounterNotifierFamily();

class EncounterNotifierFamily
    extends Family<AsyncValue<List<EncounterRecord>>> {
  const EncounterNotifierFamily();

  EncounterNotifierProvider call(String lobsterId) =>
      EncounterNotifierProvider(lobsterId);

  @override
  EncounterNotifierProvider getProviderOverride(
          covariant EncounterNotifierProvider provider) =>
      call(provider.lobsterId);

  static const Iterable<ProviderOrFamily>? _dependencies = null;

  @override
  Iterable<ProviderOrFamily>? get dependencies => _dependencies;

  static const Iterable<ProviderOrFamily>? _allTransitiveDependencies = null;

  @override
  Iterable<ProviderOrFamily>? get allTransitiveDependencies =>
      _allTransitiveDependencies;

  @override
  String? get name => r'encounterNotifierProvider';
}

class EncounterNotifierProvider extends AsyncNotifierProviderImpl<
    EncounterNotifier, List<EncounterRecord>> {
  const EncounterNotifierProvider(
    String lobsterId, {
    super.name,
    super.dependencies,
  })  : this.lobsterId = lobsterId,
        super(
          () => EncounterNotifier()..lobsterId = lobsterId,
          from: encounterNotifierProvider,
          argument: lobsterId,
          debugGetCreateSourceHash:
              const bool.fromEnvironment('dart.vm.product')
                  ? null
                  : _$encounterNotifierHash,
        );

  final String lobsterId;

  @override
  AsyncValue<List<EncounterRecord>> runNotifierBuild(
          EncounterNotifier notifier) =>
      notifier.build(lobsterId);
}
