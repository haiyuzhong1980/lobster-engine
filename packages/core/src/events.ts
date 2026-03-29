// @lobster-engine/core — Type-safe EventEmitter

import { EventEmitter } from 'node:events';
import type { TurnEvent, ActionResult } from './types.js';

// ---------------------------------------------------------------------------
// Event map — keys are event names, values are the payload type
// ---------------------------------------------------------------------------

export interface EngineEventMap {
  'bot:connected': [botId: string, sessionId: string];
  'bot:disconnected': [botId: string, sessionId: string];
  'bot:error': [botId: string, error: Error];
  'scene:joined': [botId: string, sceneId: string];
  'scene:left': [botId: string, sceneId: string];
  'scene:turn': [botId: string, sceneId: string, event: TurnEvent];
  'scene:action': [botId: string, sceneId: string, result: ActionResult];
  'scene:end': [botId: string, sceneId: string];
  'engine:ready': [];
  'engine:stopping': [];
  /** Emitted after graceful shutdown is fully complete. */
  'engine:shutdown': [];
  'engine:error': [error: Error];
}

// ---------------------------------------------------------------------------
// Typed wrapper around Node.js EventEmitter
// ---------------------------------------------------------------------------

export class TypedEventEmitter<TMap extends { [K in keyof TMap]: unknown[] }> {
  private readonly emitter = new EventEmitter();

  on<K extends keyof TMap & string>(
    event: K,
    listener: (...args: TMap[K]) => void,
  ): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  once<K extends keyof TMap & string>(
    event: K,
    listener: (...args: TMap[K]) => void,
  ): this {
    this.emitter.once(event, listener as (...args: unknown[]) => void);
    return this;
  }

  off<K extends keyof TMap & string>(
    event: K,
    listener: (...args: TMap[K]) => void,
  ): this {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
    return this;
  }

  emit<K extends keyof TMap & string>(event: K, ...args: TMap[K]): boolean {
    return this.emitter.emit(event, ...args);
  }

  removeAllListeners<K extends keyof TMap & string>(event?: K): this {
    this.emitter.removeAllListeners(event);
    return this;
  }
}

/** Pre-bound emitter type for the engine's own event surface. */
export type EngineEmitter = TypedEventEmitter<EngineEventMap>;
