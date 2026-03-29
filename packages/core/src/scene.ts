// @lobster-engine/core — ScenePlugin interface

import type { TurnEvent, ActionSpec } from './types.js';
import type { ChatMessage } from './adapter.js';

export interface SceneContext {
  readonly botId: string;
  readonly sceneId: string;
  readonly state: Readonly<Record<string, unknown>>;
  readonly history: readonly TurnEvent[];
}

export interface ActionValidationResult {
  readonly valid: boolean;
  readonly reason?: string;
}

export interface ScenePlugin {
  readonly name: string;
  readonly version: string;
  readonly sceneType: string;

  /**
   * Called once when the plugin is registered with the engine.
   * Use this to wire up event listeners or pre-allocate resources.
   */
  initialize?(engine: import('./engine.js').LobsterEngine): void | Promise<void>;

  /**
   * Convert an incoming turn event into a prompt message sequence to send to
   * the AI platform adapter.
   */
  buildPrompt(event: TurnEvent, context: SceneContext): ChatMessage[];

  /**
   * Parse the raw string response from the adapter into a structured action.
   */
  parseAction(response: string, context: SceneContext): ActionSpec;

  /**
   * Validate whether an action is legal in the current context.
   */
  validateAction(action: ActionSpec, context: SceneContext): ActionValidationResult;

  /**
   * Return a safe fallback action when the adapter response cannot be parsed
   * or fails validation.
   */
  getDefaultAction(event: TurnEvent, context: SceneContext): ActionSpec;

  /**
   * Format an event as a human-readable string, optionally from a particular
   * player's perspective.
   */
  formatEvent(event: TurnEvent, perspective?: string): string;
}
