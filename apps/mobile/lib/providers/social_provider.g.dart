// GENERATED CODE - DO NOT MODIFY BY HAND

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// ignore_for_file: type=lint
// ignore_for_file: subtype_of_sealed_class, invalid_use_of_internal_member, invalid_use_of_visible_for_testing_member

part of 'social_provider.dart';

// SocialRelationsNotifier

String _$socialRelationsNotifierHash() => r'social_relations_notifier_hash';

@ProviderFor(SocialRelationsNotifier)
const socialRelationsNotifierProvider = SocialRelationsNotifierFamily();

class SocialRelationsNotifierFamily
    extends Family<AsyncValue<List<SocialRelation>>> {
  const SocialRelationsNotifierFamily();

  SocialRelationsNotifierProvider call(String lobsterId) =>
      SocialRelationsNotifierProvider(lobsterId);

  @override
  SocialRelationsNotifierProvider getProviderOverride(
          covariant SocialRelationsNotifierProvider provider) =>
      call(provider.lobsterId);

  static const Iterable<ProviderOrFamily>? _dependencies = null;

  @override
  Iterable<ProviderOrFamily>? get dependencies => _dependencies;

  static const Iterable<ProviderOrFamily>? _allTransitiveDependencies = null;

  @override
  Iterable<ProviderOrFamily>? get allTransitiveDependencies =>
      _allTransitiveDependencies;

  @override
  String? get name => r'socialRelationsNotifierProvider';
}

class SocialRelationsNotifierProvider extends AsyncNotifierProviderImpl<
    SocialRelationsNotifier, List<SocialRelation>> {
  const SocialRelationsNotifierProvider(
    String lobsterId, {
    super.name,
    super.dependencies,
  })  : this.lobsterId = lobsterId,
        super(
          () => SocialRelationsNotifier()..lobsterId = lobsterId,
          from: socialRelationsNotifierProvider,
          argument: lobsterId,
          debugGetCreateSourceHash:
              const bool.fromEnvironment('dart.vm.product')
                  ? null
                  : _$socialRelationsNotifierHash,
        );

  final String lobsterId;

  @override
  AsyncValue<List<SocialRelation>> runNotifierBuild(
          SocialRelationsNotifier notifier) =>
      notifier.build(lobsterId);
}

// GroupEffectsNotifier

String _$groupEffectsNotifierHash() => r'group_effects_notifier_hash';

@ProviderFor(GroupEffectsNotifier)
const groupEffectsNotifierProvider = GroupEffectsNotifierFamily();

class GroupEffectsNotifierFamily
    extends Family<AsyncValue<List<GroupEffect>>> {
  const GroupEffectsNotifierFamily();

  GroupEffectsNotifierProvider call({String? geoHash}) =>
      GroupEffectsNotifierProvider(geoHash: geoHash);

  @override
  GroupEffectsNotifierProvider getProviderOverride(
          covariant GroupEffectsNotifierProvider provider) =>
      call(geoHash: provider.geoHash);

  static const Iterable<ProviderOrFamily>? _dependencies = null;

  @override
  Iterable<ProviderOrFamily>? get dependencies => _dependencies;

  static const Iterable<ProviderOrFamily>? _allTransitiveDependencies = null;

  @override
  Iterable<ProviderOrFamily>? get allTransitiveDependencies =>
      _allTransitiveDependencies;

  @override
  String? get name => r'groupEffectsNotifierProvider';
}

class GroupEffectsNotifierProvider extends AsyncNotifierProviderImpl<
    GroupEffectsNotifier, List<GroupEffect>> {
  const GroupEffectsNotifierProvider({
    String? geoHash,
    super.name,
    super.dependencies,
  })  : this.geoHash = geoHash,
        super(
          () => GroupEffectsNotifier()..geoHash = geoHash,
          from: groupEffectsNotifierProvider,
          argument: geoHash,
          debugGetCreateSourceHash:
              const bool.fromEnvironment('dart.vm.product')
                  ? null
                  : _$groupEffectsNotifierHash,
        );

  final String? geoHash;

  @override
  AsyncValue<List<GroupEffect>> runNotifierBuild(
          GroupEffectsNotifier notifier) =>
      notifier.build(geoHash: geoHash);
}
