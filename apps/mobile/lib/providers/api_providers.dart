import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import 'package:tangping_lobster/services/api_service.dart';
import 'package:tangping_lobster/services/ws_service.dart';

part 'api_providers.g.dart';

/// Base URL override for tests / dev.
///
/// Override in ProviderScope for integration tests:
/// ```dart
/// ProviderScope(
///   overrides: [apiBaseUrlProvider.overrideWithValue('http://10.0.2.2:3000')],
/// )
/// ```
@Riverpod(keepAlive: true)
String apiBaseUrl(ApiBaseUrlRef ref) => 'http://localhost:3000';

/// Singleton [ApiService] shared across all providers.
@Riverpod(keepAlive: true)
ApiService apiService(ApiServiceRef ref) {
  final baseUrl = ref.watch(apiBaseUrlProvider);
  return ApiService(baseUrl: baseUrl);
}

/// Singleton [WebSocketService] for real-time events.
@Riverpod(keepAlive: true)
WebSocketService webSocketService(WebSocketServiceRef ref) {
  final service = WebSocketService();
  ref.onDispose(service.dispose);
  return service;
}
