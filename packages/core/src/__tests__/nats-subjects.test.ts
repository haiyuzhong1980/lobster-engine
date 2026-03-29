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
