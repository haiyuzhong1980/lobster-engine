// @lobster-engine/core — NATS Subject convention tests

import { describe, it, expect } from 'vitest';
import {
  botEvent,
  botAction,
  botState,
  BOT_EVENT_ALL,
  BOT_ACTION_ALL,
  sceneBroadcast,
  sceneLifecycle,
  SCENE_BROADCAST_ALL,
  SCENE_LIFECYCLE_ALL,
  WORKER_TASK_QUEUE,
  workerHeartbeat,
  WORKER_HEARTBEAT_ALL,
  workerResult,
  SYSTEM_HEALTH,
  SYSTEM_METRICS,
  SYSTEM_SHUTDOWN,
  SYSTEM_CONFIG,
  AI_CHAT_REQUEST,
  aiChatResponse,
  aiAdapterHealth,
  QUEUE_WORKERS,
  QUEUE_GATEWAY,
  QUEUE_AI_POOL,
  validateSubjectToken,
  NatsSubjects,
  // Lobster activity
  lobsterActivity,
  lobsterEmotion,
  lobsterState,
  LOBSTER_ACTIVITY_ALL,
  LOBSTER_EMOTION_ALL,
  LOBSTER_STATE_ALL,
  // Encounter
  ENCOUNTER_MATCH,
  encounterConfirmed,
  encounterChat,
  // Social
  socialGroupEffect,
  // Arena
  arenaEvent,
  arenaResult,
  // Diary
  diaryGenerate,
  diaryReady,
} from '../nats-subjects.js';

describe('NATS Subject Conventions', () => {
  describe('bot subjects', () => {
    it('generates bot event subject', () => {
      expect(botEvent('bot-1')).toBe('bot.bot-1.event');
    });

    it('generates bot action subject', () => {
      expect(botAction('bot-1')).toBe('bot.bot-1.action');
    });

    it('generates bot state subject', () => {
      expect(botState('bot-1')).toBe('bot.bot-1.state');
    });

    it('has wildcard constants', () => {
      expect(BOT_EVENT_ALL).toBe('bot.*.event');
      expect(BOT_ACTION_ALL).toBe('bot.*.action');
    });
  });

  describe('scene subjects', () => {
    it('generates scene broadcast subject', () => {
      expect(sceneBroadcast('scene-abc')).toBe('scene.scene-abc.broadcast');
    });

    it('generates scene lifecycle subject', () => {
      expect(sceneLifecycle('scene-abc')).toBe('scene.scene-abc.lifecycle');
    });

    it('has wildcard constants', () => {
      expect(SCENE_BROADCAST_ALL).toBe('scene.*.broadcast');
      expect(SCENE_LIFECYCLE_ALL).toBe('scene.*.lifecycle');
    });
  });

  describe('worker subjects', () => {
    it('has task queue constant', () => {
      expect(WORKER_TASK_QUEUE).toBe('worker.task');
    });

    it('generates worker heartbeat subject', () => {
      expect(workerHeartbeat('w-1')).toBe('worker.w-1.heartbeat');
    });

    it('has heartbeat wildcard', () => {
      expect(WORKER_HEARTBEAT_ALL).toBe('worker.*.heartbeat');
    });

    it('generates worker result subject', () => {
      expect(workerResult('w-1')).toBe('worker.w-1.result');
    });
  });

  describe('system subjects', () => {
    it('has all system constants', () => {
      expect(SYSTEM_HEALTH).toBe('system.health');
      expect(SYSTEM_METRICS).toBe('system.metrics');
      expect(SYSTEM_SHUTDOWN).toBe('system.shutdown');
      expect(SYSTEM_CONFIG).toBe('system.config');
    });
  });

  describe('AI subjects', () => {
    it('has chat request constant', () => {
      expect(AI_CHAT_REQUEST).toBe('ai.chat.request');
    });

    it('generates chat response subject', () => {
      expect(aiChatResponse('req-123')).toBe('ai.chat.response.req-123');
    });

    it('generates adapter health subject', () => {
      expect(aiAdapterHealth('openclaw')).toBe('ai.adapter.openclaw.health');
    });
  });

  describe('queue group names', () => {
    it('has all queue group constants', () => {
      expect(QUEUE_WORKERS).toBe('lobster-workers');
      expect(QUEUE_GATEWAY).toBe('lobster-gateway');
      expect(QUEUE_AI_POOL).toBe('lobster-ai-pool');
    });
  });

  describe('subject format consistency', () => {
    it('all dynamic subjects use dot-separated tokens', () => {
      const subjects = [
        botEvent('x'),
        botAction('x'),
        botState('x'),
        sceneBroadcast('x'),
        sceneLifecycle('x'),
        workerHeartbeat('x'),
        workerResult('x'),
        aiChatResponse('x'),
        aiAdapterHealth('x'),
      ];
      for (const s of subjects) {
        expect(s).toMatch(/^[a-z]+\.[^.]+\.[a-z.]+$/);
      }
    });
  });

  describe('validateSubjectToken', () => {
    it('accepts valid alphanumeric tokens', () => {
      expect(validateSubjectToken('bot-1')).toBe(true);
      expect(validateSubjectToken('scene_abc')).toBe(true);
      expect(validateSubjectToken('ABC123')).toBe(true);
      expect(validateSubjectToken('a')).toBe(true);
    });

    it('rejects empty strings', () => {
      expect(validateSubjectToken('')).toBe(false);
    });

    it('rejects tokens longer than 128 characters', () => {
      expect(validateSubjectToken('a'.repeat(129))).toBe(false);
    });

    it('accepts tokens at exactly 128 characters', () => {
      expect(validateSubjectToken('a'.repeat(128))).toBe(true);
    });

    it('rejects tokens containing dots (NATS subject separator)', () => {
      expect(validateSubjectToken('bot.inject')).toBe(false);
    });

    it('rejects tokens containing wildcards', () => {
      expect(validateSubjectToken('bot*')).toBe(false);
      expect(validateSubjectToken('>')).toBe(false);
    });

    it('rejects tokens containing spaces', () => {
      expect(validateSubjectToken('bot 1')).toBe(false);
    });

    it('rejects tokens containing colons', () => {
      expect(validateSubjectToken('scene:room')).toBe(false);
    });

    it('rejects tokens containing slashes', () => {
      expect(validateSubjectToken('bot/1')).toBe(false);
    });
  });

  describe('subject injection prevention', () => {
    it('botEvent throws RangeError on injection attempt', () => {
      expect(() => botEvent('x.*.>')).toThrow(RangeError);
    });

    it('botAction throws RangeError on injection attempt', () => {
      expect(() => botAction('x.inject')).toThrow(RangeError);
    });

    it('sceneBroadcast throws RangeError on injection attempt', () => {
      expect(() => sceneBroadcast('scene.*.broadcast')).toThrow(RangeError);
    });

    it('NatsSubjects.botEvent throws on dot-separated input', () => {
      expect(() => NatsSubjects.botEvent('a.b')).toThrow(RangeError);
    });

    it('NatsSubjects.sceneState throws on wildcard input', () => {
      expect(() => NatsSubjects.sceneState('*')).toThrow(RangeError);
    });

    it('NatsSubjects.workerHeartbeat throws on empty input', () => {
      expect(() => NatsSubjects.workerHeartbeat('')).toThrow(RangeError);
    });

    it('aiChatResponse throws on injection attempt', () => {
      expect(() => aiChatResponse('req.*.>')).toThrow(RangeError);
    });

    it('aiAdapterHealth throws on injection attempt', () => {
      expect(() => aiAdapterHealth('adapter.*.health')).toThrow(RangeError);
    });

    it('workerHeartbeat throws on injection attempt', () => {
      expect(() => workerHeartbeat('w.inject')).toThrow(RangeError);
    });

    it('workerResult throws on injection attempt', () => {
      expect(() => workerResult('w.*')).toThrow(RangeError);
    });
  });
});

// ---------------------------------------------------------------------------
// Lobster product subjects
// ---------------------------------------------------------------------------

describe('Lobster activity subjects', () => {
  it('lobsterActivity generates correct subject', () => {
    expect(lobsterActivity('lobster-1')).toBe('lobster.lobster-1.activity');
  });

  it('lobsterEmotion generates correct subject', () => {
    expect(lobsterEmotion('lobster-1')).toBe('lobster.lobster-1.emotion');
  });

  it('lobsterState generates correct subject', () => {
    expect(lobsterState('lobster-1')).toBe('lobster.lobster-1.state');
  });

  it('has wildcard constants', () => {
    expect(LOBSTER_ACTIVITY_ALL).toBe('lobster.*.activity');
    expect(LOBSTER_EMOTION_ALL).toBe('lobster.*.emotion');
    expect(LOBSTER_STATE_ALL).toBe('lobster.*.state');
  });

  it('lobsterActivity throws RangeError on injection attempt', () => {
    expect(() => lobsterActivity('lobster.inject')).toThrow(RangeError);
  });

  it('lobsterEmotion throws RangeError on empty string', () => {
    expect(() => lobsterEmotion('')).toThrow(RangeError);
  });

  it('lobsterState throws RangeError on wildcard', () => {
    expect(() => lobsterState('*')).toThrow(RangeError);
  });

  it('NatsSubjects.lobsterActivity generates correct subject', () => {
    expect(NatsSubjects.lobsterActivity('lob-42')).toBe('lobster.lob-42.activity');
  });

  it('NatsSubjects.lobsterEmotion generates correct subject', () => {
    expect(NatsSubjects.lobsterEmotion('lob-42')).toBe('lobster.lob-42.emotion');
  });

  it('NatsSubjects.lobsterState generates correct subject', () => {
    expect(NatsSubjects.lobsterState('lob-42')).toBe('lobster.lob-42.state');
  });

  it('NatsSubjects.lobsterActivity throws on injection attempt', () => {
    expect(() => NatsSubjects.lobsterActivity('a.b')).toThrow(RangeError);
  });
});

describe('Encounter subjects', () => {
  it('ENCOUNTER_MATCH is a static constant', () => {
    expect(ENCOUNTER_MATCH).toBe('encounter.match');
  });

  it('encounterConfirmed generates correct subject', () => {
    expect(encounterConfirmed('pair-abc')).toBe('encounter.pair-abc.confirmed');
  });

  it('encounterChat generates correct subject', () => {
    expect(encounterChat('pair-abc')).toBe('encounter.pair-abc.chat');
  });

  it('encounterConfirmed throws RangeError on injection attempt', () => {
    expect(() => encounterConfirmed('pair.inject')).toThrow(RangeError);
  });

  it('encounterChat throws RangeError on empty string', () => {
    expect(() => encounterChat('')).toThrow(RangeError);
  });

  it('encounterConfirmed throws RangeError on wildcard', () => {
    expect(() => encounterConfirmed('*')).toThrow(RangeError);
  });

  it('NatsSubjects.encounterMatch is a static constant', () => {
    expect(NatsSubjects.encounterMatch).toBe('encounter.match');
  });

  it('NatsSubjects.encounterConfirmed generates correct subject', () => {
    expect(NatsSubjects.encounterConfirmed('p-1')).toBe('encounter.p-1.confirmed');
  });

  it('NatsSubjects.encounterChat generates correct subject', () => {
    expect(NatsSubjects.encounterChat('p-1')).toBe('encounter.p-1.chat');
  });

  it('NatsSubjects.encounterConfirmed throws on injection attempt', () => {
    expect(() => NatsSubjects.encounterConfirmed('a.b')).toThrow(RangeError);
  });
});

describe('Social subjects', () => {
  it('socialGroupEffect generates correct subject', () => {
    expect(socialGroupEffect('wx4g0')).toBe('social.group.wx4g0');
  });

  it('socialGroupEffect throws RangeError on injection attempt', () => {
    expect(() => socialGroupEffect('geo.hash')).toThrow(RangeError);
  });

  it('socialGroupEffect throws RangeError on empty string', () => {
    expect(() => socialGroupEffect('')).toThrow(RangeError);
  });

  it('NatsSubjects.socialGroupEffect generates correct subject', () => {
    expect(NatsSubjects.socialGroupEffect('wx4g0')).toBe('social.group.wx4g0');
  });

  it('NatsSubjects.socialGroupEffect throws on wildcard', () => {
    expect(() => NatsSubjects.socialGroupEffect('*')).toThrow(RangeError);
  });
});

describe('Arena subjects', () => {
  it('arenaEvent generates correct subject', () => {
    expect(arenaEvent('match-001')).toBe('arena.match-001.event');
  });

  it('arenaResult generates correct subject', () => {
    expect(arenaResult('match-001')).toBe('arena.match-001.result');
  });

  it('arenaEvent throws RangeError on injection attempt', () => {
    expect(() => arenaEvent('match.inject')).toThrow(RangeError);
  });

  it('arenaResult throws RangeError on empty string', () => {
    expect(() => arenaResult('')).toThrow(RangeError);
  });

  it('arenaResult throws RangeError on wildcard', () => {
    expect(() => arenaResult('*')).toThrow(RangeError);
  });

  it('NatsSubjects.arenaEvent generates correct subject', () => {
    expect(NatsSubjects.arenaEvent('m-1')).toBe('arena.m-1.event');
  });

  it('NatsSubjects.arenaResult generates correct subject', () => {
    expect(NatsSubjects.arenaResult('m-1')).toBe('arena.m-1.result');
  });

  it('NatsSubjects.arenaEvent throws on injection attempt', () => {
    expect(() => NatsSubjects.arenaEvent('a.b')).toThrow(RangeError);
  });
});

describe('Diary subjects', () => {
  it('diaryGenerate generates correct subject', () => {
    expect(diaryGenerate('lobster-1')).toBe('diary.lobster-1.generate');
  });

  it('diaryReady generates correct subject', () => {
    expect(diaryReady('lobster-1')).toBe('diary.lobster-1.ready');
  });

  it('diaryGenerate throws RangeError on injection attempt', () => {
    expect(() => diaryGenerate('lobster.inject')).toThrow(RangeError);
  });

  it('diaryReady throws RangeError on empty string', () => {
    expect(() => diaryReady('')).toThrow(RangeError);
  });

  it('diaryReady throws RangeError on wildcard', () => {
    expect(() => diaryReady('*')).toThrow(RangeError);
  });

  it('NatsSubjects.diaryGenerate generates correct subject', () => {
    expect(NatsSubjects.diaryGenerate('lob-7')).toBe('diary.lob-7.generate');
  });

  it('NatsSubjects.diaryReady generates correct subject', () => {
    expect(NatsSubjects.diaryReady('lob-7')).toBe('diary.lob-7.ready');
  });

  it('NatsSubjects.diaryGenerate throws on injection attempt', () => {
    expect(() => NatsSubjects.diaryGenerate('a.b')).toThrow(RangeError);
  });
});
