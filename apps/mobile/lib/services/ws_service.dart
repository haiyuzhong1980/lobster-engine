import 'dart:async';
import 'dart:convert';

import 'package:web_socket_channel/web_socket_channel.dart';

/// Discriminated union of events that may arrive over the WebSocket.
sealed class WsEvent {
  const WsEvent();
}

/// Raw heartbeat ping from the server.
final class WsPingEvent extends WsEvent {
  const WsPingEvent();
}

/// Lobster state has changed (emotion, energy, etc.).
final class WsLobsterUpdateEvent extends WsEvent {
  const WsLobsterUpdateEvent({
    required this.lobsterId,
    required this.payload,
  });

  final String lobsterId;
  final Map<String, Object?> payload;
}

/// An encounter was detected in a scene.
final class WsEncounterEvent extends WsEvent {
  const WsEncounterEvent({
    required this.sceneId,
    required this.encounterId,
    required this.payload,
  });

  final String sceneId;
  final String encounterId;
  final Map<String, Object?> payload;
}

/// A social event occurred (gift, confirmation, etc.).
final class WsSocialEvent extends WsEvent {
  const WsSocialEvent({
    required this.eventType,
    required this.payload,
  });

  final String eventType;
  final Map<String, Object?> payload;
}

/// Weather changed in the lobster's region.
final class WsWeatherEvent extends WsEvent {
  const WsWeatherEvent({required this.payload});

  final Map<String, Object?> payload;
}

/// A scene's group mood / effect changed.
final class WsSceneEffectEvent extends WsEvent {
  const WsSceneEffectEvent({
    required this.sceneId,
    required this.payload,
  });

  final String sceneId;
  final Map<String, Object?> payload;
}

/// An unrecognised or unhandled raw message.
final class WsUnknownEvent extends WsEvent {
  const WsUnknownEvent({required this.raw});

  final String raw;
}

// ---------------------------------------------------------------------------
// Connection state
// ---------------------------------------------------------------------------

/// Current connection state of the WebSocket.
enum WsConnectionState {
  disconnected,
  connecting,
  connected,
  reconnecting,
}

/// Real-time WebSocket client for Lobster Engine events.
///
/// Provides automatic exponential-backoff reconnection, scene subscriptions,
/// and a typed [events] stream.
class WebSocketService {
  WebSocketService({
    Duration initialReconnectDelay = const Duration(seconds: 1),
    int maxReconnectAttempts = 10,
  })  : _initialReconnectDelay = initialReconnectDelay,
        _maxReconnectAttempts = maxReconnectAttempts,
        _eventController = StreamController<WsEvent>.broadcast(),
        _connectionStateController =
            StreamController<WsConnectionState>.broadcast();

  final Duration _initialReconnectDelay;
  final int _maxReconnectAttempts;

  WebSocketChannel? _channel;
  StreamSubscription<Object?>? _subscription;
  Timer? _reconnectTimer;

  final StreamController<WsEvent> _eventController;
  final StreamController<WsConnectionState> _connectionStateController;

  String? _lastUrl;
  String? _lastToken;
  final Set<String> _subscribedScenes = {};

  int _reconnectAttempts = 0;
  bool _intentionalClose = false;

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /// Typed stream of all events received from the server.
  Stream<WsEvent> get events => _eventController.stream;

  /// Stream of connection state changes.
  Stream<WsConnectionState> get connectionState =>
      _connectionStateController.stream;

  /// Connect to the WebSocket at [url], optionally authenticating with [token].
  Future<void> connect(String url, {String? token}) async {
    _lastUrl = url;
    _lastToken = token;
    _intentionalClose = false;
    _reconnectAttempts = 0;

    _emitConnectionState(WsConnectionState.connecting);
    await _openChannel(url, token: token);
  }

  /// Subscribe to real-time events for a scene.
  void subscribe(String sceneId) {
    _subscribedScenes.add(sceneId);
    _sendMessage({'type': 'subscribe', 'sceneId': sceneId});
  }

  /// Unsubscribe from scene events.
  void unsubscribe(String sceneId) {
    _subscribedScenes.remove(sceneId);
    _sendMessage({'type': 'unsubscribe', 'sceneId': sceneId});
  }

  /// Gracefully close the WebSocket connection.
  void disconnect() {
    _intentionalClose = true;
    _cleanup();
    _emitConnectionState(WsConnectionState.disconnected);
  }

  /// Release all resources. Must be called when the service is no longer needed.
  Future<void> dispose() async {
    _intentionalClose = true;
    _cleanup();
    await _eventController.close();
    await _connectionStateController.close();
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  Future<void> _openChannel(String url, {String? token}) async {
    _cleanup();

    final uri = token != null
        ? Uri.parse(url).replace(
            queryParameters: {
              ...Uri.parse(url).queryParameters,
              'token': token,
            },
          )
        : Uri.parse(url);

    _channel = WebSocketChannel.connect(uri);

    // Wait for the handshake to complete.
    try {
      await _channel!.ready;
    } on WebSocketChannelException catch (_) {
      _scheduleReconnect();
      return;
    }

    _emitConnectionState(WsConnectionState.connected);
    _reconnectAttempts = 0;

    // Re-subscribe to any previously subscribed scenes.
    for (final sceneId in _subscribedScenes) {
      _sendMessage({'type': 'subscribe', 'sceneId': sceneId});
    }

    _subscription = _channel!.stream.listen(
      _onMessage,
      onError: _onError,
      onDone: _onDone,
    );
  }

  void _onMessage(Object? raw) {
    if (raw is! String) return;
    _eventController.add(_parseEvent(raw));
  }

  void _onError(Object error) {
    if (!_intentionalClose) {
      _scheduleReconnect();
    }
  }

  void _onDone() {
    if (!_intentionalClose) {
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
    if (_intentionalClose) return;
    if (_reconnectAttempts >= _maxReconnectAttempts) return;

    _emitConnectionState(WsConnectionState.reconnecting);
    _cleanup();

    final delay = _initialReconnectDelay *
        (1 << _reconnectAttempts.clamp(0, 10)); // 2^n capped at 1024×
    _reconnectAttempts++;

    _reconnectTimer = Timer(delay, () async {
      if (!_intentionalClose && _lastUrl != null) {
        await _openChannel(_lastUrl!, token: _lastToken);
      }
    });
  }

  void _cleanup() {
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    _subscription?.cancel();
    _subscription = null;
    _channel?.sink.close();
    _channel = null;
  }

  void _sendMessage(Map<String, Object?> payload) {
    try {
      _channel?.sink.add(jsonEncode(payload));
    } catch (_) {
      // Channel may be closed; silently ignore.
    }
  }

  void _emitConnectionState(WsConnectionState state) {
    if (!_connectionStateController.isClosed) {
      _connectionStateController.add(state);
    }
  }

  WsEvent _parseEvent(String raw) {
    try {
      final json = jsonDecode(raw);
      if (json is! Map<String, Object?>) return WsUnknownEvent(raw: raw);

      final type = json['type'];
      if (type is! String) return WsUnknownEvent(raw: raw);

      switch (type) {
        case 'ping':
          return const WsPingEvent();

        case 'lobster.update':
          final lobsterId = json['lobsterId'];
          final payload = json['payload'];
          if (lobsterId is String && payload is Map<String, Object?>) {
            return WsLobsterUpdateEvent(
              lobsterId: lobsterId,
              payload: payload,
            );
          }

        case 'encounter':
          final sceneId = json['sceneId'];
          final encounterId = json['encounterId'];
          final payload = json['payload'];
          if (sceneId is String &&
              encounterId is String &&
              payload is Map<String, Object?>) {
            return WsEncounterEvent(
              sceneId: sceneId,
              encounterId: encounterId,
              payload: payload,
            );
          }

        case 'social':
          final eventType = json['eventType'];
          final payload = json['payload'];
          if (eventType is String && payload is Map<String, Object?>) {
            return WsSocialEvent(eventType: eventType, payload: payload);
          }

        case 'weather':
          final payload = json['payload'];
          if (payload is Map<String, Object?>) {
            return WsWeatherEvent(payload: payload);
          }

        case 'scene.effect':
          final sceneId = json['sceneId'];
          final payload = json['payload'];
          if (sceneId is String && payload is Map<String, Object?>) {
            return WsSceneEffectEvent(sceneId: sceneId, payload: payload);
          }
      }
    } catch (_) {
      // JSON parse failure — fall through to unknown.
    }
    return WsUnknownEvent(raw: raw);
  }
}
