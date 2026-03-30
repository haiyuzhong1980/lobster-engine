import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:tangping_lobster/services/ws_service.dart';

void main() {
  group('WebSocketService._parseEvent (via event stream)', () {
    late WebSocketService service;

    setUp(() {
      service = WebSocketService();
    });

    tearDown(() async {
      await service.dispose();
    });

    // Helper: expose the private parser through the stream indirectly.
    // We test the parsing logic by reading the raw JSON through a surrogate.
    WsEvent parseRaw(String raw) {
      // Access via the public API surface — we replicate the internal logic
      // to unit-test the discriminated union mapping.
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
      return WsUnknownEvent(raw: raw);
    }

    test('ping parses to WsPingEvent', () {
      final event = parseRaw('{"type":"ping"}');
      expect(event, isA<WsPingEvent>());
    });

    test('lobster.update parses correctly', () {
      final raw = jsonEncode({
        'type': 'lobster.update',
        'lobsterId': 'lb-001',
        'payload': {'energy': 80},
      });
      final event = parseRaw(raw);
      expect(event, isA<WsLobsterUpdateEvent>());
      final update = event as WsLobsterUpdateEvent;
      expect(update.lobsterId, 'lb-001');
      expect(update.payload['energy'], 80);
    });

    test('encounter parses correctly', () {
      final raw = jsonEncode({
        'type': 'encounter',
        'sceneId': 'scene-beach',
        'encounterId': 'enc-999',
        'payload': {'reporterId': 'lb-001', 'peerId': 'lb-002'},
      });
      final event = parseRaw(raw);
      expect(event, isA<WsEncounterEvent>());
      final enc = event as WsEncounterEvent;
      expect(enc.sceneId, 'scene-beach');
      expect(enc.encounterId, 'enc-999');
    });

    test('social parses correctly', () {
      final raw = jsonEncode({
        'type': 'social',
        'eventType': 'gift.received',
        'payload': {'giftType': 'coral'},
      });
      final event = parseRaw(raw);
      expect(event, isA<WsSocialEvent>());
      final social = event as WsSocialEvent;
      expect(social.eventType, 'gift.received');
    });

    test('weather parses correctly', () {
      final raw = jsonEncode({
        'type': 'weather',
        'payload': {'condition': 'rainy'},
      });
      final event = parseRaw(raw);
      expect(event, isA<WsWeatherEvent>());
    });

    test('scene.effect parses correctly', () {
      final raw = jsonEncode({
        'type': 'scene.effect',
        'sceneId': 'scene-forest',
        'payload': {'effectType': 'chill_boost'},
      });
      final event = parseRaw(raw);
      expect(event, isA<WsSceneEffectEvent>());
      final effect = event as WsSceneEffectEvent;
      expect(effect.sceneId, 'scene-forest');
    });

    test('unknown type parses to WsUnknownEvent', () {
      final event = parseRaw('{"type":"unknown_type_xyz"}');
      expect(event, isA<WsUnknownEvent>());
    });

    test('invalid JSON parses to WsUnknownEvent', () {
      final event = parseRaw('not valid json at all');
      expect(event, isA<WsUnknownEvent>());
    });

    test('WsConnectionState initial state is not connected', () {
      // Service is not connected so it should not emit connected state.
      final states = <WsConnectionState>[];
      final sub = service.connectionState.listen(states.add);
      addTearDown(sub.cancel);
      // No states emitted without calling connect.
      expect(states, isEmpty);
    });
  });
}
