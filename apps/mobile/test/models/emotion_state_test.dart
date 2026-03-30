import 'package:flutter_test/flutter_test.dart';
import 'package:tangping_lobster/models/emotion_state.dart';

void main() {
  group('EmotionState', () {
    const activatedAt = '2024-06-15T10:00:00Z';

    const chillEmotion = EmotionState(
      type: EmotionType.chill,
      activatedAt: activatedAt,
    );

    test('default intensity is 0.5', () {
      expect(chillEmotion.intensity, 0.5);
    });

    test('fromJson round-trips correctly', () {
      final json = chillEmotion.toJson();
      final restored = EmotionState.fromJson(json);
      expect(restored.type, EmotionType.chill);
      expect(restored.activatedAt, activatedAt);
      expect(restored.intensity, 0.5);
    });

    test('toJson serialises type as string', () {
      final json = chillEmotion.toJson();
      expect(json['type'], 'chill');
    });

    test('copyWith produces a new instance with changed field', () {
      final updated = chillEmotion.copyWith(
        type: EmotionType.happy,
        intensity: 0.9,
      );
      expect(updated.type, EmotionType.happy);
      expect(updated.intensity, 0.9);
      // Original must be unchanged (immutability contract).
      expect(chillEmotion.type, EmotionType.chill);
    });

    test('nullable fields serialise absent when null', () {
      final json = chillEmotion.toJson();
      expect(json.containsKey('description'), isFalse);
      expect(json.containsKey('trigger'), isFalse);
      expect(json.containsKey('expiresAt'), isFalse);
    });

    test('fromJson deserialises optional fields when present', () {
      final json = <String, Object?>{
        'type': 'stressed',
        'intensity': 0.8,
        'description': 'Deadline approaching',
        'trigger': 'calendar_reminder',
        'activatedAt': activatedAt,
        'expiresAt': '2024-06-15T11:00:00Z',
      };
      final emotion = EmotionState.fromJson(json);
      expect(emotion.type, EmotionType.stressed);
      expect(emotion.description, 'Deadline approaching');
      expect(emotion.trigger, 'calendar_reminder');
      expect(emotion.expiresAt, '2024-06-15T11:00:00Z');
    });

    test('all EmotionType variants deserialise without error', () {
      for (final type in EmotionType.values) {
        final json = <String, Object?>{
          'type': type.name,
          'activatedAt': activatedAt,
        };
        final emotion = EmotionState.fromJson(json);
        expect(emotion.type, type);
      }
    });
  });
}
