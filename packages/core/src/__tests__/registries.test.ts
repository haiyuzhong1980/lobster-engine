// @lobster-engine/core — Registry tests

import { describe, it, expect } from 'vitest';
import { ScenePluginRegistry } from '../scene-registry.js';
import { AdapterRegistry, AdapterNotFoundError } from '../adapter-registry.js';
import { MockScenePlugin, MockAIPlatformAdapter } from './helpers.js';

// ---------------------------------------------------------------------------
// ScenePluginRegistry
// ---------------------------------------------------------------------------

describe('ScenePluginRegistry', () => {
  it('registers and retrieves a plugin by name', () => {
    const registry = new ScenePluginRegistry();
    const plugin = new MockScenePlugin();
    registry.register(plugin);
    expect(registry.get(plugin.name)).toBe(plugin);
  });

  it('has() returns true for registered plugin', () => {
    const registry = new ScenePluginRegistry();
    const plugin = new MockScenePlugin();
    registry.register(plugin);
    expect(registry.has(plugin.name)).toBe(true);
  });

  it('has() returns false for unregistered plugin', () => {
    const registry = new ScenePluginRegistry();
    expect(registry.has('nonexistent')).toBe(false);
  });

  it('throws when registering duplicate name', () => {
    const registry = new ScenePluginRegistry();
    registry.register(new MockScenePlugin({ name: 'dup', sceneType: 'type-a' }));
    expect(() =>
      registry.register(new MockScenePlugin({ name: 'dup', sceneType: 'type-b' })),
    ).toThrowError(/dup/);
  });

  it('throws when registering duplicate sceneType', () => {
    const registry = new ScenePluginRegistry();
    registry.register(new MockScenePlugin({ name: 'plugin-a', sceneType: 'werewolf' }));
    expect(() =>
      registry.register(new MockScenePlugin({ name: 'plugin-b', sceneType: 'werewolf' })),
    ).toThrowError(/werewolf/);
  });

  it('getByType() retrieves plugin by sceneType', () => {
    const registry = new ScenePluginRegistry();
    const plugin = new MockScenePlugin({ sceneType: 'mafia' });
    registry.register(plugin);
    expect(registry.getByType('mafia')).toBe(plugin);
  });

  it('getByType() returns undefined for unknown sceneType', () => {
    const registry = new ScenePluginRegistry();
    expect(registry.getByType('unknown-type')).toBeUndefined();
  });

  it('list() returns descriptors for all registered plugins', () => {
    const registry = new ScenePluginRegistry();
    registry.register(new MockScenePlugin({ name: 'p1', sceneType: 'scene-1', version: '1.0.0' }));
    registry.register(new MockScenePlugin({ name: 'p2', sceneType: 'scene-2', version: '2.0.0' }));
    const list = registry.list();
    expect(list).toHaveLength(2);
    const names = list.map((d) => d.name);
    expect(names).toContain('p1');
    expect(names).toContain('p2');
  });

  it('list() returns read-only descriptors (not plugin instances)', () => {
    const registry = new ScenePluginRegistry();
    const plugin = new MockScenePlugin();
    registry.register(plugin);
    const list = registry.list();
    expect(list[0]).not.toBe(plugin);
    expect(list[0]).toHaveProperty('name');
    expect(list[0]).toHaveProperty('version');
    expect(list[0]).toHaveProperty('sceneType');
  });

  it('unregister() removes a plugin', () => {
    const registry = new ScenePluginRegistry();
    const plugin = new MockScenePlugin();
    registry.register(plugin);
    const removed = registry.unregister(plugin.name);
    expect(removed).toBe(true);
    expect(registry.has(plugin.name)).toBe(false);
  });

  it('unregister() returns false for unknown plugin', () => {
    const registry = new ScenePluginRegistry();
    expect(registry.unregister('nonexistent')).toBe(false);
  });

  it('allows re-registration after unregister', () => {
    const registry = new ScenePluginRegistry();
    const plugin = new MockScenePlugin();
    registry.register(plugin);
    registry.unregister(plugin.name);
    expect(() => registry.register(plugin)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// AdapterRegistry
// ---------------------------------------------------------------------------

describe('AdapterRegistry', () => {
  it('registers and retrieves an adapter by name', () => {
    const registry = new AdapterRegistry();
    const adapter = new MockAIPlatformAdapter();
    registry.register(adapter);
    expect(registry.get(adapter.name)).toBe(adapter);
  });

  it('has() returns true for registered adapter', () => {
    const registry = new AdapterRegistry();
    const adapter = new MockAIPlatformAdapter();
    registry.register(adapter);
    expect(registry.has(adapter.name)).toBe(true);
  });

  it('has() returns false for unregistered adapter', () => {
    const registry = new AdapterRegistry();
    expect(registry.has('ghost')).toBe(false);
  });

  it('throws when registering duplicate name', () => {
    const registry = new AdapterRegistry();
    registry.register(new MockAIPlatformAdapter({ name: 'dup', platform: 'mock-1' }));
    expect(() =>
      registry.register(new MockAIPlatformAdapter({ name: 'dup', platform: 'mock-2' })),
    ).toThrowError(/dup/);
  });

  it('getByPlatform() retrieves adapter by platform', () => {
    const registry = new AdapterRegistry();
    const adapter = new MockAIPlatformAdapter({ platform: 'coze' });
    registry.register(adapter);
    expect(registry.getByPlatform('coze')).toBe(adapter);
  });

  it('getByPlatform() returns undefined for unknown platform', () => {
    const registry = new AdapterRegistry();
    expect(registry.getByPlatform('unknown-platform')).toBeUndefined();
  });

  it('list() returns descriptors for all registered adapters', () => {
    const registry = new AdapterRegistry();
    registry.register(new MockAIPlatformAdapter({ name: 'a1', platform: 'p1' }));
    registry.register(new MockAIPlatformAdapter({ name: 'a2', platform: 'p2' }));
    const list = registry.list();
    expect(list).toHaveLength(2);
    const names = list.map((d) => d.name);
    expect(names).toContain('a1');
    expect(names).toContain('a2');
  });

  // -------------------------------------------------------------------------
  // detectAvailable()
  // -------------------------------------------------------------------------

  describe('detectAvailable()', () => {
    it('returns adapters whose detect() returns true', async () => {
      const registry = new AdapterRegistry();
      const available = new MockAIPlatformAdapter({ name: 'avail', platform: 'p1' });
      const unavailable = new MockAIPlatformAdapter({
        name: 'unavail',
        platform: 'p2',
        unavailable: true,
      });
      registry.register(available);
      registry.register(unavailable);

      const result = await registry.detectAvailable();
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(available);
    });

    it('returns empty array when all adapters are unavailable', async () => {
      const registry = new AdapterRegistry();
      registry.register(new MockAIPlatformAdapter({ unavailable: true }));
      const result = await registry.detectAvailable();
      expect(result).toHaveLength(0);
    });

    it('treats a detect() rejection as unavailable', async () => {
      const registry = new AdapterRegistry();
      const adapter = new MockAIPlatformAdapter();
      // Override detect to throw
      adapter.detect = async () => { throw new Error('network error'); };
      registry.register(adapter);

      const result = await registry.detectAvailable();
      expect(result).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // selectAdapter()
  // -------------------------------------------------------------------------

  describe('selectAdapter()', () => {
    it('returns first available adapter when no preferred name given', async () => {
      const registry = new AdapterRegistry();
      const adapter = new MockAIPlatformAdapter();
      registry.register(adapter);

      const selected = await registry.selectAdapter();
      expect(selected).toBe(adapter);
    });

    it('returns preferred adapter by name regardless of availability', async () => {
      const registry = new AdapterRegistry();
      const preferred = new MockAIPlatformAdapter({
        name: 'preferred',
        platform: 'p1',
        unavailable: true, // would fail detection
      });
      const other = new MockAIPlatformAdapter({ name: 'other', platform: 'p2' });
      registry.register(preferred);
      registry.register(other);

      const selected = await registry.selectAdapter('preferred');
      expect(selected).toBe(preferred);
    });

    it('throws AdapterNotFoundError when no adapters available', async () => {
      const registry = new AdapterRegistry();
      registry.register(new MockAIPlatformAdapter({ unavailable: true }));

      await expect(registry.selectAdapter()).rejects.toThrow(AdapterNotFoundError);
    });

    it('throws AdapterNotFoundError with descriptive message', async () => {
      const registry = new AdapterRegistry();

      await expect(registry.selectAdapter()).rejects.toThrow(/No AI platform adapters/);
    });

    it('falls back to detectAvailable when preferred name is not registered', async () => {
      const registry = new AdapterRegistry();
      const adapter = new MockAIPlatformAdapter({ name: 'real', platform: 'p1' });
      registry.register(adapter);

      // 'nonexistent' is not registered, falls through to detection
      const selected = await registry.selectAdapter('nonexistent');
      expect(selected).toBe(adapter);
    });
  });
});
