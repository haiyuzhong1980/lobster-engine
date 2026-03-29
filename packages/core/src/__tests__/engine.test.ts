// @lobster-engine/core — LobsterEngine tests

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LobsterEngine } from '../engine.js';
import { MockAIPlatformAdapter, MockScenePlugin, MockStorageProvider, makeTurnEvent } from './helpers.js';

describe('LobsterEngine', () => {
  let engine: LobsterEngine;

  beforeEach(() => {
    engine = new LobsterEngine({ name: 'test-engine' });
  });

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  describe('lifecycle', () => {
    it('starts and sets running to true', async () => {
      expect(engine.running).toBe(false);
      await engine.start();
      expect(engine.running).toBe(true);
      await engine.stop();
    });

    it('stops and sets running to false', async () => {
      await engine.start();
      expect(engine.running).toBe(true);
      await engine.stop();
      expect(engine.running).toBe(false);
    });

    it('start is idempotent', async () => {
      await engine.start();
      await engine.start(); // second call is no-op
      expect(engine.running).toBe(true);
      await engine.stop();
    });

    it('stop is idempotent when not running', async () => {
      await engine.stop(); // should not throw
      expect(engine.running).toBe(false);
    });

    it('emits engine:ready on start', async () => {
      const handler = vi.fn();
      engine.on('engine:ready', handler);
      await engine.start();
      expect(handler).toHaveBeenCalledOnce();
      await engine.stop();
    });

    it('emits engine:stopping on stop', async () => {
      const handler = vi.fn();
      await engine.start();
      engine.on('engine:stopping', handler);
      await engine.stop();
      expect(handler).toHaveBeenCalledOnce();
    });

    it('connects adapter on start and disconnects on stop', async () => {
      const adapter = new MockAIPlatformAdapter();
      engine.registerAdapter(adapter);
      await engine.start();
      expect(adapter.connectCallCount).toBe(1);
      await engine.stop();
      expect(adapter.disconnectCallCount).toBe(1);
    });

    it('initialises plugins on start', async () => {
      const plugin = new MockScenePlugin();
      engine.use(plugin);
      await engine.start();
      expect(plugin.initializeCallCount).toBe(1);
      await engine.stop();
    });

    it('connects storage on start', async () => {
      const storage = new MockStorageProvider();
      engine.useStorage(storage);
      await engine.start();
      expect(storage.connected).toBe(true);
      await engine.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Plugin registration via use()
  // -------------------------------------------------------------------------

  describe('use()', () => {
    it('registers a scene plugin', () => {
      const plugin = new MockScenePlugin();
      engine.use(plugin);
      expect(engine.scenes.has(plugin.name)).toBe(true);
    });

    it('is chainable', () => {
      const p1 = new MockScenePlugin({ name: 'plugin-a', sceneType: 'scene-a' });
      const p2 = new MockScenePlugin({ name: 'plugin-b', sceneType: 'scene-b' });
      const result = engine.use(p1).use(p2);
      expect(result).toBe(engine);
      expect(engine.scenes.has('plugin-a')).toBe(true);
      expect(engine.scenes.has('plugin-b')).toBe(true);
    });

    it('initialises plugin immediately when engine is already running', async () => {
      await engine.start();
      const plugin = new MockScenePlugin({ name: 'late-plugin', sceneType: 'late-scene' });
      engine.use(plugin);
      // Allow the microtask queue to flush
      await new Promise((r) => setTimeout(r, 10));
      expect(plugin.initializeCallCount).toBe(1);
      await engine.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Adapter registration
  // -------------------------------------------------------------------------

  describe('registerAdapter()', () => {
    it('registers an adapter', () => {
      const adapter = new MockAIPlatformAdapter();
      engine.registerAdapter(adapter);
      expect(engine.adapters.has(adapter.name)).toBe(true);
    });

    it('is chainable', () => {
      const a1 = new MockAIPlatformAdapter({ name: 'adapter-a', platform: 'mock-a' });
      const a2 = new MockAIPlatformAdapter({ name: 'adapter-b', platform: 'mock-b' });
      const result = engine.registerAdapter(a1).registerAdapter(a2);
      expect(result).toBe(engine);
    });
  });

  // -------------------------------------------------------------------------
  // handleTurnEvent pipeline
  // -------------------------------------------------------------------------

  describe('handleTurnEvent()', () => {
    it('completes a full turn: buildPrompt → chat → parseAction → success result', async () => {
      const plugin = new MockScenePlugin();
      const adapter = new MockAIPlatformAdapter();

      engine.use(plugin).registerAdapter(adapter);
      await engine.start();

      const event = makeTurnEvent({ sceneId: 'mock-scene:room-1' });
      const result = await engine.handleTurnEvent(event);

      expect(result.success).toBe(true);
      expect(result.action.type).toBe('vote');
      expect(plugin.buildPromptCallCount).toBe(1);
      expect(plugin.parseActionCallCount).toBe(1);
      expect(adapter.chatCallCount).toBe(1);

      await engine.stop();
    });

    it('emits scene:turn before processing', async () => {
      const plugin = new MockScenePlugin();
      const adapter = new MockAIPlatformAdapter();
      engine.use(plugin).registerAdapter(adapter);
      await engine.start();

      const turnHandler = vi.fn();
      engine.on('scene:turn', turnHandler);

      const event = makeTurnEvent({ sceneId: 'mock-scene:room-1' });
      await engine.handleTurnEvent(event);
      expect(turnHandler).toHaveBeenCalledOnce();
      await engine.stop();
    });

    it('emits scene:action after processing', async () => {
      const plugin = new MockScenePlugin();
      const adapter = new MockAIPlatformAdapter();
      engine.use(plugin).registerAdapter(adapter);
      await engine.start();

      const actionHandler = vi.fn();
      engine.on('scene:action', actionHandler);

      const event = makeTurnEvent({ sceneId: 'mock-scene:room-1' });
      await engine.handleTurnEvent(event);
      expect(actionHandler).toHaveBeenCalledOnce();
      await engine.stop();
    });

    it('falls back to default action when parseAction throws', async () => {
      const plugin = new MockScenePlugin({
        parseError: new Error('parse failed'),
      });
      const adapter = new MockAIPlatformAdapter();
      engine.use(plugin).registerAdapter(adapter);
      await engine.start();

      const event = makeTurnEvent({ sceneId: 'mock-scene:room-1' });
      const result = await engine.handleTurnEvent(event);

      // parseAction threw → default action used, still success: false because parseError
      expect(result.action.type).toBe('noop');
      expect(result.error).toContain('parse failed');
      await engine.stop();
    });

    it('returns failed result when validation fails', async () => {
      const plugin = new MockScenePlugin({ invalidReason: 'target is dead' });
      const adapter = new MockAIPlatformAdapter();
      engine.use(plugin).registerAdapter(adapter);
      await engine.start();

      const event = makeTurnEvent({ sceneId: 'mock-scene:room-1' });
      const result = await engine.handleTurnEvent(event);

      expect(result.success).toBe(false);
      expect(result.error).toContain('target is dead');
      await engine.stop();
    });

    it('emits engine:error and returns failed result when no plugin found', async () => {
      await engine.start();

      const errorHandler = vi.fn();
      engine.on('engine:error', errorHandler);

      const event = makeTurnEvent({ sceneId: 'unknown-scene:xyz' });
      const result = await engine.handleTurnEvent(event);

      expect(result.success).toBe(false);
      expect(errorHandler).toHaveBeenCalledOnce();
      await engine.stop();
    });

    it('emits engine:error and returns failed result when no adapter available', async () => {
      const plugin = new MockScenePlugin();
      const unavailableAdapter = new MockAIPlatformAdapter({ unavailable: true });
      engine.use(plugin).registerAdapter(unavailableAdapter);
      await engine.start();

      const errorHandler = vi.fn();
      engine.on('engine:error', errorHandler);

      const event = makeTurnEvent({ sceneId: 'mock-scene:room-1' });
      const result = await engine.handleTurnEvent(event);

      expect(result.success).toBe(false);
      expect(errorHandler).toHaveBeenCalledOnce();
      await engine.stop();
    });

    it('handles prefix-matching: sceneType "mock-scene" matches sceneId "mock-scene:room-42"', async () => {
      const plugin = new MockScenePlugin({ sceneType: 'mock-scene' });
      const adapter = new MockAIPlatformAdapter();
      engine.use(plugin).registerAdapter(adapter);
      await engine.start();

      const event = makeTurnEvent({ sceneId: 'mock-scene:room-42' });
      const result = await engine.handleTurnEvent(event);

      expect(result.success).toBe(true);
      await engine.stop();
    });

    it('includes duration in result', async () => {
      const plugin = new MockScenePlugin();
      const adapter = new MockAIPlatformAdapter();
      engine.use(plugin).registerAdapter(adapter);
      await engine.start();

      const event = makeTurnEvent({ sceneId: 'mock-scene:room-1' });
      const result = await engine.handleTurnEvent(event);

      expect(typeof result.duration).toBe('number');
      expect(result.duration).toBeGreaterThanOrEqual(0);
      await engine.stop();
    });
  });
});
