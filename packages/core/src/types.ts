// @lobster-engine/core — Core types

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface Logger {
  trace(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  fatal(message: string, context?: Record<string, unknown>): void;
}

// ---------------------------------------------------------------------------
// Bot identity and state
// ---------------------------------------------------------------------------

export interface BotCredentials {
  readonly id: string;
  readonly token: string;
  readonly platform: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export type SessionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'playing'
  | 'disconnecting'
  | 'error';

export interface BotState {
  readonly sessionId: string;
  readonly status: SessionStatus;
  readonly sceneId: string | undefined;
  readonly credentials: BotCredentials;
  readonly config: Readonly<Record<string, unknown>>;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: number;
  readonly updatedAt: number;
}

// ---------------------------------------------------------------------------
// Turn / event model
// ---------------------------------------------------------------------------

export type TurnPhase = 'day' | 'night' | 'vote' | 'discuss' | 'resolve';

export interface TurnEvent {
  readonly id: string;
  readonly botId: string;
  readonly sceneId: string;
  readonly type: string;
  readonly phase: TurnPhase | string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly timestamp: number;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export interface ActionSpec {
  readonly type: string;
  readonly content: string;
  readonly target: string | undefined;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface ActionResult {
  readonly success: boolean;
  readonly action: ActionSpec;
  readonly error: string | undefined;
  readonly duration: number;
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

export type SceneStatus = 'waiting' | 'active' | 'paused' | 'ended';

export interface SceneMetadata {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly playerCount: number;
  readonly status: SceneStatus;
  readonly config: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Engine configuration
// ---------------------------------------------------------------------------

import type { StorageProvider } from './storage.js';
import type { AIPlatformAdapter } from './adapter.js';
import type { ScenePlugin } from './scene.js';

export interface EngineConfig {
  readonly name: string;
  readonly version?: string;
  readonly storage?: StorageProvider;
  readonly adapters?: readonly AIPlatformAdapter[];
  readonly plugins?: readonly ScenePlugin[];
  readonly logger?: Logger;
}

// ---------------------------------------------------------------------------
// Engine events (discriminated union)
// ---------------------------------------------------------------------------

export type EngineEvent =
  | { readonly type: 'bot:connected'; readonly payload: { botId: string; sessionId: string } }
  | { readonly type: 'bot:disconnected'; readonly payload: { botId: string; sessionId: string } }
  | { readonly type: 'bot:error'; readonly payload: { botId: string; error: Error } }
  | { readonly type: 'scene:joined'; readonly payload: { botId: string; sceneId: string } }
  | { readonly type: 'scene:left'; readonly payload: { botId: string; sceneId: string } }
  | { readonly type: 'scene:turn'; readonly payload: { botId: string; sceneId: string; event: TurnEvent } }
  | { readonly type: 'scene:action'; readonly payload: { botId: string; sceneId: string; result: ActionResult } }
  | { readonly type: 'scene:end'; readonly payload: { botId: string; sceneId: string } }
  | { readonly type: 'engine:ready'; readonly payload: Record<string, never> }
  | { readonly type: 'engine:stopping'; readonly payload: Record<string, never> }
  | { readonly type: 'engine:error'; readonly payload: { error: Error } };
