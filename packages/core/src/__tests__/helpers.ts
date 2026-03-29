// @lobster-engine/core — Test helpers and mock implementations

import type { StorageProvider, QueryFilter } from '../storage.js';
import type {
  AIPlatformAdapter,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  AdapterCapabilities,
} from '../adapter.js';
import type { ScenePlugin, SceneContext, ActionValidationResult } from '../scene.js';
import type { TurnEvent, ActionSpec } from '../types.js';

// ---------------------------------------------------------------------------
// Mock StorageProvider (Map-based)
// ---------------------------------------------------------------------------

export class MockStorageProvider implements StorageProvider {
  readonly name = 'mock-storage';
  private readonly store = new Map<string, unknown>();
  private _connected = false;

  get connected(): boolean {
    return this._connected;
  }

  async connect(): Promise<void> {
    this._connected = true;
  }

  async disconnect(): Promise<void> {
    this._connected = false;
    this.store.clear();
  }

  async health(): Promise<boolean> {
    return this._connected;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const val = this.store.get(key);
    return val === undefined ? null : (val as T);
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async getMany<T = unknown>(keys: readonly string[]): Promise<Map<string, T>> {
    const result = new Map<string, T>();
    for (const key of keys) {
      const val = this.store.get(key);
      if (val !== undefined) result.set(key, val as T);
    }
    return result;
  }

  async setMany<T = unknown>(entries: ReadonlyMap<string, T>): Promise<void> {
    for (const [key, value] of entries) {
      this.store.set(key, value);
    }
  }

  async query<T = unknown>(filter: QueryFilter): Promise<readonly T[]> {
    const results: T[] = [];
    const offset = filter.offset ?? 0;
    const limit = filter.limit;
    let skipped = 0;

    for (const [key, value] of this.store) {
      if (filter.prefix !== undefined && !key.startsWith(filter.prefix)) continue;
      if (skipped < offset) {
        skipped++;
        continue;
      }
      if (limit !== undefined && results.length >= limit) break;
      results.push(value as T);
    }
    return results;
  }

  async count(filter: QueryFilter): Promise<number> {
    let total = 0;
    for (const key of this.store.keys()) {
      if (filter.prefix !== undefined && !key.startsWith(filter.prefix)) continue;
      total++;
    }
    const offset = filter.offset ?? 0;
    const available = Math.max(0, total - offset);
    return filter.limit !== undefined ? Math.min(available, filter.limit) : available;
  }
}

// ---------------------------------------------------------------------------
// Mock AIPlatformAdapter
// ---------------------------------------------------------------------------

export interface MockAdapterOptions {
  readonly name?: string;
  readonly platform?: string;
  /** If true, detect() returns false */
  readonly unavailable?: boolean;
  /** Fixed response content */
  readonly responseContent?: string;
  /** If provided, chat() throws this error */
  readonly chatError?: Error;
}

export class MockAIPlatformAdapter implements AIPlatformAdapter {
  readonly name: string;
  readonly platform: string;

  private readonly _unavailable: boolean;
  private readonly _responseContent: string;
  private readonly _chatError: Error | undefined;

  connectCallCount = 0;
  disconnectCallCount = 0;
  chatCallCount = 0;
  lastMessages: readonly ChatMessage[] = [];
  lastOptions: ChatOptions | undefined;

  constructor(options: MockAdapterOptions = {}) {
    this.name = options.name ?? 'mock-adapter';
    this.platform = options.platform ?? 'mock';
    this._unavailable = options.unavailable ?? false;
    this._responseContent = options.responseContent ?? '{"type":"vote","target":"player1"}';
    this._chatError = options.chatError;
  }

  async detect(): Promise<boolean> {
    return !this._unavailable;
  }

  async connect(): Promise<void> {
    this.connectCallCount++;
  }

  async disconnect(): Promise<void> {
    this.disconnectCallCount++;
  }

  async chat(messages: readonly ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    this.chatCallCount++;
    this.lastMessages = messages;
    this.lastOptions = options;

    if (this._chatError !== undefined) {
      throw this._chatError;
    }

    return {
      content: this._responseContent,
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    };
  }

  getCapabilities(): AdapterCapabilities {
    return {
      streaming: false,
      functionCalling: false,
      vision: false,
      maxContextLength: 4096,
    };
  }
}

// ---------------------------------------------------------------------------
// Mock ScenePlugin
// ---------------------------------------------------------------------------

export interface MockPluginOptions {
  readonly name?: string;
  readonly version?: string;
  readonly sceneType?: string;
  /** If provided, parseAction throws this error */
  readonly parseError?: Error;
  /** If provided, validateAction returns invalid with this reason */
  readonly invalidReason?: string;
  /** Fixed action returned by parseAction (when no parseError) */
  readonly parsedAction?: ActionSpec;
}

export class MockScenePlugin implements ScenePlugin {
  readonly name: string;
  readonly version: string;
  readonly sceneType: string;

  private readonly _parseError: Error | undefined;
  private readonly _invalidReason: string | undefined;
  private readonly _parsedAction: ActionSpec;

  buildPromptCallCount = 0;
  parseActionCallCount = 0;
  validateActionCallCount = 0;
  initializeCallCount = 0;

  constructor(options: MockPluginOptions = {}) {
    this.name = options.name ?? 'mock-plugin';
    this.version = options.version ?? '0.0.1';
    this.sceneType = options.sceneType ?? 'mock-scene';
    this._parseError = options.parseError;
    this._invalidReason = options.invalidReason;
    this._parsedAction = options.parsedAction ?? {
      type: 'vote',
      content: 'vote for player1',
      target: 'player1',
      metadata: {},
    };
  }

  initialize(): void {
    this.initializeCallCount++;
  }

  buildPrompt(event: TurnEvent, _context: SceneContext): ChatMessage[] {
    this.buildPromptCallCount++;
    return [
      { role: 'system', content: 'You are a game bot.' },
      { role: 'user', content: `Event: ${event.type} in phase ${event.phase}` },
    ];
  }

  parseAction(response: string, _context: SceneContext): ActionSpec {
    this.parseActionCallCount++;
    if (this._parseError !== undefined) {
      throw this._parseError;
    }
    void response;
    return this._parsedAction;
  }

  validateAction(_action: ActionSpec, _context: SceneContext): ActionValidationResult {
    this.validateActionCallCount++;
    if (this._invalidReason !== undefined) {
      return { valid: false, reason: this._invalidReason };
    }
    return { valid: true };
  }

  getDefaultAction(_event: TurnEvent, _context: SceneContext): ActionSpec {
    return {
      type: 'noop',
      content: 'default action',
      target: undefined,
      metadata: {},
    };
  }

  formatEvent(event: TurnEvent, perspective?: string): string {
    return `[${perspective ?? 'all'}] ${event.type} @ ${event.phase}`;
  }
}

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

export function makeTurnEvent(overrides?: Partial<TurnEvent>): TurnEvent {
  return {
    id: 'test-event-1',
    botId: 'bot-1',
    sceneId: 'mock-scene:room-1',
    type: 'vote_phase',
    phase: 'vote',
    data: {},
    timestamp: Date.now(),
    ...overrides,
  };
}
