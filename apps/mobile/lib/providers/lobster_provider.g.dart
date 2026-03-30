// GENERATED CODE - DO NOT MODIFY BY HAND

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// ignore_for_file: type=lint
// ignore_for_file: subtype_of_sealed_class, invalid_use_of_internal_member, invalid_use_of_visible_for_testing_member

part of 'lobster_provider.dart';

// .............................................................................
// LobsterNotifierProvider
// .............................................................................

String _$lobsterNotifierHash() => r'lobster_notifier_hash';

/// See also [LobsterNotifier].
@ProviderFor(LobsterNotifier)
const lobsterNotifierProvider = LobsterNotifierFamily();

class LobsterNotifierFamily extends Family<AsyncValue<LobsterState>> {
  const LobsterNotifierFamily();

  LobsterNotifierProvider call(String id) => LobsterNotifierProvider(id);

  @override
  LobsterNotifierProvider getProviderOverride(
          covariant LobsterNotifierProvider provider) =>
      call(provider.id);

  static const Iterable<ProviderOrFamily>? _dependencies = null;

  @override
  Iterable<ProviderOrFamily>? get dependencies => _dependencies;

  static const Iterable<ProviderOrFamily>? _allTransitiveDependencies = null;

  @override
  Iterable<ProviderOrFamily>? get allTransitiveDependencies =>
      _allTransitiveDependencies;

  @override
  String? get name => r'lobsterNotifierProvider';
}

class LobsterNotifierProvider
    extends AsyncNotifierProviderImpl<LobsterNotifier, LobsterState> {
  const LobsterNotifierProvider(
    String id, {
    super.name,
    super.dependencies,
  })  : this.id = id,
        super(
          () => LobsterNotifier()..id = id,
          from: lobsterNotifierProvider,
          argument: id,
          debugGetCreateSourceHash:
              const bool.fromEnvironment('dart.vm.product')
                  ? null
                  : _$lobsterNotifierHash,
        );

  final String id;

  @override
  AsyncValue<LobsterState> runNotifierBuild(LobsterNotifier notifier) =>
      notifier.build(id);
}

// .............................................................................
// RegisterLobsterProvider
// .............................................................................

String _$registerLobsterHash() => r'register_lobster_hash';

@ProviderFor(registerLobster)
const registerLobsterProvider = RegisterLobsterFamily();

class RegisterLobsterFamily extends Family<AsyncValue<LobsterState>> {
  const RegisterLobsterFamily();

  RegisterLobsterProvider call({
    required String name,
    required String ownerId,
  }) =>
      RegisterLobsterProvider(name: name, ownerId: ownerId);

  @override
  RegisterLobsterProvider getProviderOverride(
          covariant RegisterLobsterProvider provider) =>
      call(name: provider.name, ownerId: provider.ownerId);

  static const Iterable<ProviderOrFamily>? _dependencies = null;

  @override
  Iterable<ProviderOrFamily>? get dependencies => _dependencies;

  static const Iterable<ProviderOrFamily>? _allTransitiveDependencies = null;

  @override
  Iterable<ProviderOrFamily>? get allTransitiveDependencies =>
      _allTransitiveDependencies;

  @override
  String? get name => r'registerLobsterProvider';
}

class RegisterLobsterProvider
    extends AutoDisposeFutureProviderElement<LobsterState>
    with RegisterLobsterRef {
  RegisterLobsterProvider({
    required this.name,
    required this.ownerId,
    super.name,
    super.dependencies,
  }) : super(
          (ref) => registerLobster(ref, name: name, ownerId: ownerId),
          from: registerLobsterProvider,
          argument: (name: name, ownerId: ownerId),
          debugGetCreateSourceHash:
              const bool.fromEnvironment('dart.vm.product')
                  ? null
                  : _$registerLobsterHash,
        );

  final String name;
  final String ownerId;

  @override
  bool operator ==(Object other) {
    return other is RegisterLobsterProvider &&
        other.name == name &&
        other.ownerId == ownerId;
  }

  @override
  int get hashCode => Object.hash(name, ownerId);
}

mixin RegisterLobsterRef on AutoDisposeFutureProviderRef<LobsterState> {
  String get name;
  String get ownerId;
}
