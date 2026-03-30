// GENERATED CODE - DO NOT MODIFY BY HAND

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// ignore_for_file: type=lint
// ignore_for_file: subtype_of_sealed_class, invalid_use_of_internal_member, invalid_use_of_visible_for_testing_member

part of 'weather_provider.dart';

String _$weatherNotifierHash() => r'weather_notifier_hash';

@ProviderFor(WeatherNotifier)
const weatherNotifierProvider = WeatherNotifierFamily();

class WeatherNotifierFamily extends Family<AsyncValue<WeatherResponse>> {
  const WeatherNotifierFamily();

  WeatherNotifierProvider call({
    required double lat,
    required double lon,
  }) =>
      WeatherNotifierProvider(lat: lat, lon: lon);

  @override
  WeatherNotifierProvider getProviderOverride(
          covariant WeatherNotifierProvider provider) =>
      call(lat: provider.lat, lon: provider.lon);

  static const Iterable<ProviderOrFamily>? _dependencies = null;

  @override
  Iterable<ProviderOrFamily>? get dependencies => _dependencies;

  static const Iterable<ProviderOrFamily>? _allTransitiveDependencies = null;

  @override
  Iterable<ProviderOrFamily>? get allTransitiveDependencies =>
      _allTransitiveDependencies;

  @override
  String? get name => r'weatherNotifierProvider';
}

class WeatherNotifierProvider
    extends AsyncNotifierProviderImpl<WeatherNotifier, WeatherResponse> {
  const WeatherNotifierProvider({
    required this.lat,
    required this.lon,
    super.name,
    super.dependencies,
  }) : super(
          () => WeatherNotifier()
            ..lat = lat
            ..lon = lon,
          from: weatherNotifierProvider,
          argument: (lat: lat, lon: lon),
          debugGetCreateSourceHash:
              const bool.fromEnvironment('dart.vm.product')
                  ? null
                  : _$weatherNotifierHash,
        );

  final double lat;
  final double lon;

  @override
  AsyncValue<WeatherResponse> runNotifierBuild(WeatherNotifier notifier) =>
      notifier.build(lat: lat, lon: lon);
}
