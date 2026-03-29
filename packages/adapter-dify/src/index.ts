// @lobster-engine/adapter-dify
// Dify AI platform adapter (https://dify.ai)

import type {
  AIPlatformAdapter,
  AdapterCapabilities,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ChatUsage,
} from '@lobster-engine/core';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface DifyConfig {
  readonly apiUrl?: string;
  readonly apiKey: string;
  readonly appId?: string;
  readonly timeout?: number;
  readonly maxRetries?: number;
  /** Stable end-user identifier. Defaults to "lobster-engine". */
  readonly user?: string;
}

// ---------------------------------------------------------------------------
// Internal Dify wire types
// ---------------------------------------------------------------------------

interface DifyUsage {
  total_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
}

interface DifyMetadata {
  usage?: DifyUsage;
}

interface DifyChatResponse {
  answer: string;
  conversation_id: string;
  message_id: string;
  metadata?: DifyMetadata;
}

interface DifyErrorResponse {
  status?: number;
  code?: string;
  message?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 500;
const DIFY_API_BASE = 'https://api.dify.ai/v1';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function isDifyChatResponse(value: unknown): value is DifyChatResponse {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj['answer'] === 'string' && typeof obj['conversation_id'] === 'string';
}

function isDifyError(value: unknown): value is DifyErrorResponse {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return 'message' in obj || 'code' in obj;
}

function parseUsage(metadata: DifyMetadata | undefined): ChatUsage | undefined {
  if (metadata?.usage == null) return undefined;
  const { total_tokens, prompt_tokens, completion_tokens } = metadata.usage;
  if (total_tokens == null && prompt_tokens == null && completion_tokens == null) return undefined;
  return {
    promptTokens: prompt_tokens ?? 0,
    completionTokens: completion_tokens ?? 0,
    totalTokens: total_tokens ?? (prompt_tokens ?? 0) + (completion_tokens ?? 0),
  };
}

/**
 * Collapse multi-turn messages into a single query string for Dify's
 * non-conversational blocking mode. System messages are excluded (they are
 * part of the Dify app's system prompt configuration). Only the last user
 * message is sent as the active query; earlier turns are prepended as context.
 */
function buildQuery(messages: readonly ChatMessage[]): string {
  const relevant = messages.filter((m) => m.role !== 'system');
  if (relevant.length === 0) return '';
  if (relevant.length === 1) return relevant[0].content;

  // Build a simple conversation transcript so the bot has context.
  const lines = relevant.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// DifyAdapter
// ---------------------------------------------------------------------------

export class DifyAdapter implements AIPlatformAdapter {
  readonly name = 'dify';
  readonly platform = 'dify';

  private readonly config: DifyConfig;
  private readonly apiBase: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly user: string;
  private connected = false;
  /** Persisted across turns to enable multi-turn conversations. */
  private conversationId: string | undefined = undefined;

  constructor(config: DifyConfig) {
    this.config = config;
    this.apiBase = (config.apiUrl ?? DIFY_API_BASE).replace(/\/$/, '');
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.user = config.user ?? 'lobster-engine';
  }

  // -------------------------------------------------------------------------
  // AIPlatformAdapter implementation
  // -------------------------------------------------------------------------

  async detect(): Promise<boolean> {
    if (!this.config.apiKey || this.config.apiKey.length === 0) return false;

    // Use the parameters endpoint as a lightweight probe.
    const url = `${this.apiBase}/parameters`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: this.buildHeaders(),
          signal: controller.signal,
        });
        return response.ok || response.status === 401 || response.status === 403;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return false;
    }
  }

  async connect(): Promise<void> {
    if (!this.config.apiKey || this.config.apiKey.length === 0) {
      throw new Error('DifyAdapter: apiKey is required');
    }

    await this.validateApiKey();
    this.connected = true;
    this.conversationId = undefined;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.conversationId = undefined;
  }

  async chat(messages: readonly ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    if (!this.connected) {
      throw new Error('DifyAdapter: not connected — call connect() first');
    }

    const effectiveTimeout = options?.timeout ?? this.timeout;
    const query = buildQuery(messages);

    const requestBody: Record<string, unknown> = {
      inputs: {},
      query,
      user: this.user,
      response_mode: 'blocking',
    };

    if (this.conversationId != null) {
      requestBody['conversation_id'] = this.conversationId;
    }

    const body = JSON.stringify(requestBody);
    const result = await this.fetchWithRetry(body, effectiveTimeout);

    // Persist conversation_id for subsequent turns.
    if (result.metadata?.['conversationId'] != null) {
      this.conversationId = result.metadata['conversationId'] as string;
    }

    return result;
  }

  getCapabilities(): AdapterCapabilities {
    return {
      streaming: false,
      functionCalling: false,
      vision: false,
      maxContextLength: 8_192,
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
    };
  }

  private async validateApiKey(): Promise<void> {
    const url = `${this.apiBase}/parameters`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.buildHeaders(),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (response.status === 401 || response.status === 403) {
        throw new Error('DifyAdapter: authentication failed — check apiKey');
      }

      if (!response.ok && response.status !== 404) {
        throw new Error(`DifyAdapter: failed to validate API key — HTTP ${response.status}`);
      }
    } catch (err: unknown) {
      clearTimeout(timer);
      if (err instanceof Error && err.message.startsWith('DifyAdapter:')) throw err;
      throw new Error(
        `DifyAdapter: connect failed — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async fetchWithRetry(body: string, timeoutMs: number): Promise<ChatResponse> {
    const url = `${this.apiBase}/chat-messages`;
    let lastError: Error = new Error('DifyAdapter: unexpected retry failure');

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
        await sleep(backoff);
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: this.buildHeaders(),
          body,
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (!response.ok) {
          if (isRetryable(response.status) && attempt < this.maxRetries) {
            lastError = new Error(
              `DifyAdapter: HTTP ${response.status} — will retry (attempt ${attempt + 1}/${this.maxRetries})`,
            );
            continue;
          }

          const rawBody: unknown = await response.json().catch(() => null);
          const errorMessage =
            isDifyError(rawBody) && rawBody.message != null
              ? rawBody.message
              : `HTTP ${response.status}`;

          throw new Error(`DifyAdapter: ${errorMessage}`);
        }

        const rawBody: unknown = await response.json();
        if (!isDifyChatResponse(rawBody)) {
          throw new Error('DifyAdapter: unexpected response format from server');
        }

        return {
          content: rawBody.answer,
          finishReason: 'stop',
          usage: parseUsage(rawBody.metadata),
          metadata: { conversationId: rawBody.conversation_id, messageId: rawBody.message_id },
        };
      } catch (err: unknown) {
        clearTimeout(timer);

        if (err instanceof Error && err.name === 'AbortError') {
          lastError = new Error(
            `DifyAdapter: request timed out after ${timeoutMs}ms (attempt ${attempt + 1})`,
          );
          if (attempt < this.maxRetries) continue;
          throw lastError;
        }

        if (err instanceof Error && err.message.startsWith('DifyAdapter:')) {
          throw err;
        }

        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < this.maxRetries) continue;
      }
    }

    throw lastError;
  }
}
