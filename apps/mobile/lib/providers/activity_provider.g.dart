// GENERATED CODE - DO NOT MODIFY BY HAND

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// ignore_for_file: type=lint
// ignore_for_file: subtype_of_sealed_class, invalid_use_of_internal_member, invalid_use_of_visible_for_testing_member

part of 'activity_provider.dart';

String _$activityNotifierHash() => r'activity_notifier_hash';

@ProviderFor(ActivityNotifier)
const activityNotifierProvider = ActivityNotifierFamily();

class ActivityNotifierFamily extends Family<SensorState> {
  const ActivityNotifierFamily();

  ActivityNotifierProvider call(String lobsterId) =>
      ActivityNotifierProvider(lobsterId);

  @override
  ActivityNotifierProvider getProviderOverride(
          covariant ActivityNotifierProvider provider) =>
      call(provider.lobsterId);

  static const Iterable<ProviderOrFamily>? _dependencies = null;

  @override
  Iterable<ProviderOrFamily>? get dependencies => _dependencies;

  static const Iterable<ProviderOrFamily>? _allTransitiveDependencies = null;

  @override
  Iterable<ProviderOrFamily>? get allTransitiveDependencies =>
      _allTransitiveDependencies;

  @override
  String? get name => r'activityNotifierProvider';
}

class ActivityNotifierProvider
    extends NotifierProviderImpl<ActivityNotifier, SensorState> {
  const ActivityNotifierProvider(
    String lobsterId, {
    super.name,
    super.dependencies,
  })  : this.lobsterId = lobsterId,
        super(
          () => ActivityNotifier()..lobsterId = lobsterId,
          from: activityNotifierProvider,
          argument: lobsterId,
          debugGetCreateSourceHash:
              const bool.fromEnvironment('dart.vm.product')
                  ? null
                  : _$activityNotifierHash,
        );

  final String lobsterId;

  @override
  SensorState runNotifierBuild(ActivityNotifier notifier) =>
      notifier.build(lobsterId);
}
