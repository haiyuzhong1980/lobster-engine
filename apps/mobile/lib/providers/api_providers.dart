import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:tangping_lobster/services/api_service.dart';
import 'package:tangping_lobster/services/ws_service.dart';

/// Base URL override for tests / dev.
///
/// Override in ProviderScope for integration tests:
/// ```dart
/// ProviderScope(
///   overrides: [apiBaseUrlProvider.overrideWithValue('http://10.0.2.2:3000')],
/// )
/// ```
final apiBaseUrlProvider = Provider<String>(
  (ref) => 'http://localhost:3000',
);

/// Singleton [ApiService] shared across all providers.
final apiServiceProvider = Provider<ApiService>((ref) {
  final baseUrl = ref.watch(apiBaseUrlProvider);
  return ApiService(baseUrl: baseUrl);
});

/// Singleton [WebSocketService] for real-time events.
final webSocketServiceProvider = Provider<WebSocketService>((ref) {
  final service = WebSocketService();
  ref.onDispose(service.dispose);
  return service;
});
