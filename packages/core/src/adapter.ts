// @lobster-engine/core — AIPlatformAdapter interface

export interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export interface ChatOptions {
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly timeout?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ChatUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

export interface ChatResponse {
  readonly content: string;
  readonly finishReason: 'stop' | 'length' | 'error';
  readonly usage?: ChatUsage;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface AdapterCapabilities {
  readonly streaming: boolean;
  readonly functionCalling: boolean;
  readonly vision: boolean;
  readonly maxContextLength: number;
}

export interface AIPlatformAdapter {
  readonly name: string;
  readonly platform: string;

  /** Returns true if this adapter can successfully reach its platform. */
  detect(): Promise<boolean>;

  connect(): Promise<void>;
  disconnect(): Promise<void>;

  chat(messages: readonly ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  getCapabilities(): AdapterCapabilities;
}
