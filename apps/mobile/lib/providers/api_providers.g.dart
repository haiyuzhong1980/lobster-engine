// GENERATED CODE - DO NOT MODIFY BY HAND

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// ignore_for_file: type=lint
// ignore_for_file: subtype_of_sealed_class, invalid_use_of_internal_member, invalid_use_of_visible_for_testing_member

part of 'api_providers.dart';

// .............................................................................
// ApiBaseUrlProvider
// .............................................................................

String _$apiBaseUrlHash() => r'api_base_url_hash';

@ProviderFor(apiBaseUrl)
final apiBaseUrlProvider = Provider<String>.internal(
  apiBaseUrl,
  name: r'apiBaseUrlProvider',
  debugGetCreateSourceHash:
      const bool.fromEnvironment('dart.vm.product') ? null : _$apiBaseUrlHash,
  dependencies: null,
  allTransitiveDependencies: null,
);

typedef ApiBaseUrlRef = ProviderRef<String>;

// .............................................................................
// ApiServiceProvider
// .............................................................................

String _$apiServiceHash() => r'api_service_hash';

@ProviderFor(apiService)
final apiServiceProvider = Provider<ApiService>.internal(
  apiService,
  name: r'apiServiceProvider',
  debugGetCreateSourceHash:
      const bool.fromEnvironment('dart.vm.product') ? null : _$apiServiceHash,
  dependencies: null,
  allTransitiveDependencies: null,
);

typedef ApiServiceRef = ProviderRef<ApiService>;

// .............................................................................
// WebSocketServiceProvider
// .............................................................................

String _$webSocketServiceHash() => r'web_socket_service_hash';

@ProviderFor(webSocketService)
final webSocketServiceProvider = Provider<WebSocketService>.internal(
  webSocketService,
  name: r'webSocketServiceProvider',
  debugGetCreateSourceHash:
      const bool.fromEnvironment('dart.vm.product') ? null : _$webSocketServiceHash,
  dependencies: null,
  allTransitiveDependencies: null,
);

typedef WebSocketServiceRef = ProviderRef<WebSocketService>;
