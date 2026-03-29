// @lobster-engine/core — ScenePluginRegistry

import type { ScenePlugin } from './scene.js';

// ---------------------------------------------------------------------------
// ScenePluginRegistry
// ---------------------------------------------------------------------------

/**
 * A registry for ScenePlugin instances.
 *
 * Plugins are keyed by name. Each plugin also declares a sceneType which
 * identifies the category of scene it handles (e.g. "werewolf", "chat").
 * A given sceneType may only be served by one plugin at a time — the first
 * registration wins, and subsequent registrations for the same sceneType are
 * rejected unless the prior plugin is unregistered first.
 */
export class ScenePluginRegistry {
  private readonly plugins = new Map<string, ScenePlugin>();

  /**
   * Register a plugin.
   *
   * @throws {Error} if a plugin with the same name is already registered.
   * @throws {Error} if a plugin with the same sceneType is already registered.
   */
  register(plugin: ScenePlugin): void {
    if (this.plugins.has(plugin.name)) {
      throw new Error(
        `ScenePlugin "${plugin.name}" is already registered. ` +
          `Unregister it first before re-registering.`,
      );
    }

    const existing = this.getByType(plugin.sceneType);
    if (existing !== undefined) {
      throw new Error(
        `A ScenePlugin for sceneType "${plugin.sceneType}" is already registered ` +
          `(plugin name: "${existing.name}"). ` +
          `Unregister it first before registering "${plugin.name}".`,
      );
    }

    this.plugins.set(plugin.name, plugin);
  }

  /**
   * Retrieve a plugin by its unique name.
   */
  get(name: string): ScenePlugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * Retrieve a plugin by the sceneType it handles.
   */
  getByType(sceneType: string): ScenePlugin | undefined {
    for (const plugin of this.plugins.values()) {
      if (plugin.sceneType === sceneType) {
        return plugin;
      }
    }
    return undefined;
  }

  /**
   * Returns a snapshot of all registered plugins as read-only descriptors.
   */
  list(): ReadonlyArray<{ name: string; version: string; sceneType: string }> {
    return Array.from(this.plugins.values()).map(({ name, version, sceneType }) => ({
      name,
      version,
      sceneType,
    }));
  }

  /**
   * Returns true when a plugin with the given name is registered.
   */
  has(name: string): boolean {
    return this.plugins.has(name);
  }

  /**
   * Remove a plugin by name.
   *
   * @returns true if the plugin was found and removed, false otherwise.
   */
  unregister(name: string): boolean {
    return this.plugins.delete(name);
  }
}
