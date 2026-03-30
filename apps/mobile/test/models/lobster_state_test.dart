import 'package:flutter_test/flutter_test.dart';
import 'package:tangping_lobster/models/emotion_state.dart';
import 'package:tangping_lobster/models/lobster_state.dart';
import 'package:tangping_lobster/models/personality_dna.dart';

void main() {
  group('LobsterState', () {
    final emotion = EmotionState(
      type: EmotionType.chill,
      activatedAt: '2024-06-15T10:00:00Z',
    );

    final personality = PersonalityDna(
      archetype: PersonalityArchetype.slowLiver,
      traits: [
        PersonalityTrait(
          key: 'openness',
          label: 'Openness',
          value: 0.6,
        ),
      ],
    );

    final lobster = LobsterState(
      id: 'lobster-001',
      name: 'Chilly McShell',
      ownerId: 'user-abc',
      emotion: emotion,
      personality: personality,
      updatedAt: '2024-06-15T10:00:00Z',
      createdAt: '2024-01-01T00:00:00Z',
    );

    test('default numeric fields', () {
      expect(lobster.energy, 100);
      expect(lobster.happiness, 50);
      expect(lobster.chillScore, 50);
      expect(lobster.shellBalance, 0);
      expect(lobster.xp, 0);
      expect(lobster.level, 1);
    });

    test('fromJson round-trips correctly', () {
      final json = lobster.toJson();
      final restored = LobsterState.fromJson(json);
      expect(restored.id, lobster.id);
      expect(restored.name, lobster.name);
      expect(restored.ownerId, lobster.ownerId);
      expect(restored.emotion.type, EmotionType.chill);
      expect(restored.personality.archetype, PersonalityArchetype.slowLiver);
    });

    test('copyWith preserves immutability', () {
      final updated = lobster.copyWith(energy: 80, chillScore: 90);
      expect(updated.energy, 80);
      expect(updated.chillScore, 90);
      expect(lobster.energy, 100);
      expect(lobster.chillScore, 50);
    });

    test('optional fields absent from JSON when null', () {
      final json = lobster.toJson();
      expect(json.containsKey('currentSceneId'), isFalse);
      expect(json.containsKey('avatarUrl'), isFalse);
    });

    test('optional fields present in JSON when set', () {
      final withScene = lobster.copyWith(
        currentSceneId: 'scene-beach',
        avatarUrl: 'https://cdn.example.com/lobster.png',
      );
      final json = withScene.toJson();
      expect(json['currentSceneId'], 'scene-beach');
      expect(json['avatarUrl'], 'https://cdn.example.com/lobster.png');
    });
  });
}
