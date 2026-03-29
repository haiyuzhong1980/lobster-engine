// @lobster-engine/adapter-coze
// Coze AI platform adapter (https://www.coze.com)

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

export interface CozeConfig {
  readonly apiUrl?: string;
  readonly apiKey: string;
  readonly botId: string;
  readonly timeout?: number;
  readonly maxRetries?: number;
  /** Stable user identifier forwarded with each request. Defaults to "lobster-engine". */
  readonly userId?: string;
}

// ---------------------------------------------------------------------------
// Internal Coze v3 wire types
// ---------------------------------------------------------------------------

interface CozeMessage {
  role: string;
  content: string;
  content_type: 'text';
}

interface CozeChatMessage {
  role: string;
  content: string;
  type?: string;
}

interface CozeChatData {
  id: string;
  conversation_id: string;
  status: string;
  usage?: {
    token_count?: number;
    output_count?: number;
    input_count?: number;
  };
  messages?: CozeChatMessage[];
}

interface CozeChatResponse {
  code: number;
  msg: string;
  data: CozeChatData;
}

interface CozeBotInfo {
  bot_id?: string;
  name?: string;
  description?: string;
}

interface CozeBotResponse {
  code: number;
  msg: string;
  data?: CozeBotInfo;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 500;
const COZE_API_BASE = 'https://api.coze.com';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function isCozeChatResponse(value: unknown): value is CozeChatResponse {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj['code'] === 'number' && typeof obj['data'] === 'object' && obj['data'] !== null;
}

function isCozeBotResponse(value: unknown): value is CozeBotResponse {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj['code'] === 'number';
}

function parseUsage(data: CozeChatData): ChatUsage | undefined {
  if (data.usage == null) return undefined;
  const { token_count, output_count, input_count } = data.usage;
  if (token_count == null && output_count == null && input_count == null) return undefined;
  const total = token_count ?? (input_count ?? 0) + (output_count ?? 0);
  return {
    promptTokens: input_count ?? 0,
    completionTokens: output_count ?? 0,
    totalTokens: total,
  };
}

function extractAssistantContent(data: CozeChatData): string {
  if (data.messages == null || data.messages.length === 0) return '';
  // Prefer the last assistant answer message
  const answer = data.messages.find((m) => m.role === 'assistant' && m.type === 'answer');
  if (answer != null) return answer.content;
  const assistantMsg = [...data.messages].reverse().find((m) => m.role === 'assistant');
  return assistantMsg?.content ?? '';
}

// ---------------------------------------------------------------------------
// CozeAdapter
// ---------------------------------------------------------------------------

export class CozeAdapter implements AIPlatformAdapter {
  readonly name = 'coze';
  readonly platform = 'coze';

  private readonly config: CozeConfig;
  private readonly apiBase: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly userId: string;
  private connected = false;

  constructor(config: CozeConfig) {
    this.config = config;
    this.apiBase = (config.apiUrl ?? COZE_API_BASE).replace(/\/$/, '');
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.userId = config.userId ?? 'lobster-engine';
  }

  // -------------------------------------------------------------------------
  // AIPlatformAdapter implementation
  // -------------------------------------------------------------------------

  async detect(): Promise<boolean> {
    if (!this.config.apiKey || !this.config.botId) return false;

    // Probe the bot info endpoint as a lightweight health check.
    const url = `${this.apiBase}/v1/bot/get_online_info?bot_id=${encodeURIComponent(this.config.botId)}`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: this.buildHeaders(),
          signal: controller.signal,
        });
        // 200 or 401/403 means the server is reachable.
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
      throw new Error('CozeAdapter: apiKey is required');
    }
    if (!this.config.botId || this.config.botId.length === 0) {
      throw new Error('CozeAdapter: botId is required');
    }

    await this.fetchBotInfo();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async chat(messages: readonly ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    if (!this.connected) {
      throw new Error('CozeAdapter: not connected — call connect() first');
    }

    const effectiveTimeout = options?.timeout ?? this.timeout;

    // Map messages to Coze additional_messages format (exclude system messages as they
    // are not part of the Coze additional_messages array — system prompts are configured
    // on the bot itself).
    const additionalMessages: CozeMessage[] = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role,
        content: m.content,
        content_type: 'text' as const,
      }));

    const body = JSON.stringify({
      bot_id: this.config.botId,
      user_id: this.userId,
      additional_messages: additionalMessages,
      stream: false,
    });

    return this.fetchWithRetry(body, effectiveTimeout);
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

  private async fetchBotInfo(): Promise<void> {
    const url = `${this.apiBase}/v1/bot/get_online_info?bot_id=${encodeURIComponent(this.config.botId)}`;
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
        throw new Error('CozeAdapter: authentication failed — check apiKey');
      }

      if (!response.ok) {
        throw new Error(`CozeAdapter: failed to fetch bot info — HTTP ${response.status}`);
      }

      const rawBody: unknown = await response.json().catch(() => null);
      if (isCozeBotResponse(rawBody) && rawBody.code !== 0) {
        throw new Error(`CozeAdapter: bot info error — ${rawBody.msg}`);
      }
    } catch (err: unknown) {
      clearTimeout(timer);
      if (err instanceof Error && err.message.startsWith('CozeAdapter:')) throw err;
      throw new Error(
        `CozeAdapter: connect failed — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async fetchWithRetry(body: string, timeoutMs: number): Promise<ChatResponse> {
    const url = `${this.apiBase}/v3/chat`;
    let lastError: Error = new Error('CozeAdapter: unexpected retry failure');

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
              `CozeAdapter: HTTP ${response.status} — will retry (attempt ${attempt + 1}/${this.maxRetries})`,
            );
            continue;
          }
          throw new Error(`CozeAdapter: HTTP ${response.status}`);
        }

        const rawBody: unknown = await response.json();
        if (!isCozeChatResponse(rawBody)) {
          throw new Error('CozeAdapter: unexpected response format from server');
        }

        if (rawBody.code !== 0) {
          throw new Error(`CozeAdapter: API error — ${rawBody.msg}`);
        }

        const content = extractAssistantContent(rawBody.data);
        return {
          content,
          finishReason: rawBody.data.status === 'completed' ? 'stop' : 'error',
          usage: parseUsage(rawBody.data),
        };
      } catch (err: unknown) {
        clearTimeout(timer);

        if (err instanceof Error && err.name === 'AbortError') {
          lastError = new Error(
            `CozeAdapter: request timed out after ${timeoutMs}ms (attempt ${attempt + 1})`,
          );
          if (attempt < this.maxRetries) continue;
          throw lastError;
        }

        if (err instanceof Error && err.message.startsWith('CozeAdapter:')) {
          throw err;
        }

        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < this.maxRetries) continue;
      }
    }

    throw lastError;
  }
}
