// @lobster-engine/adapter-openclaw
// OpenClaw Gateway AI platform adapter

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

export interface OpenClawAdapterConfig {
  readonly gatewayUrl: string;
  readonly botToken?: string;
  readonly agentId?: string;
  readonly timeout?: number;
}

// ---------------------------------------------------------------------------
// Internal wire types
// ---------------------------------------------------------------------------

interface OpenClawHealthResponse {
  status?: string;
  ok?: boolean;
}

interface OpenAIMessage {
  role: string;
  content: string;
}

interface OpenAIChoice {
  message: OpenAIMessage;
  finish_reason: string | null;
}

interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface OpenAIResponse {
  choices: OpenAIChoice[];
  usage?: OpenAIUsage;
}

interface OpenClawCapabilitiesResponse {
  streaming?: boolean;
  functionCalling?: boolean;
  vision?: boolean;
  maxContextLength?: number;
}

interface OpenAIError {
  error?: {
    message?: string;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 30_000;

function isOpenAIResponse(value: unknown): value is OpenAIResponse {
  if (typeof value !== 'object' || value === null) return false;
  return Array.isArray((value as Record<string, unknown>)['choices']);
}

function isOpenAIError(value: unknown): value is OpenAIError {
  if (typeof value !== 'object' || value === null) return false;
  return 'error' in (value as Record<string, unknown>);
}

function isOpenClawCapabilities(value: unknown): value is OpenClawCapabilitiesResponse {
  return typeof value === 'object' && value !== null;
}

function isHealthOk(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as OpenClawHealthResponse;
  return obj.status === 'ok' || obj.ok === true || obj.status === 'healthy';
}

function parseFinishReason(raw: string | null | undefined): ChatResponse['finishReason'] {
  if (raw === 'stop') return 'stop';
  if (raw === 'length') return 'length';
  return 'error';
}

function parseUsage(usage: OpenAIUsage | undefined): ChatUsage | undefined {
  if (usage == null) return undefined;
  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  };
}

// ---------------------------------------------------------------------------
// OpenClawAdapter
// ---------------------------------------------------------------------------

export class OpenClawAdapter implements AIPlatformAdapter {
  readonly name = 'openclaw';
  readonly platform = 'openclaw';

  private readonly config: OpenClawAdapterConfig;
  private readonly timeout: number;
  private connected = false;

  constructor(config: OpenClawAdapterConfig) {
    this.config = config;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT_MS;
  }

  // -------------------------------------------------------------------------
  // AIPlatformAdapter implementation
  // -------------------------------------------------------------------------

  async detect(): Promise<boolean> {
    const url = `${this.config.gatewayUrl}/health`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: this.buildHeaders(),
          signal: controller.signal,
        });
        if (!response.ok) return false;
        const body: unknown = await response.json().catch(() => ({ ok: true }));
        return isHealthOk(body);
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return false;
    }
  }

  async connect(): Promise<void> {
    const reachable = await this.detect();
    if (!reachable) {
      throw new Error(
        `OpenClawAdapter: cannot reach gateway at ${this.config.gatewayUrl} — check gatewayUrl and network connectivity`,
      );
    }

    if (this.config.botToken != null && this.config.botToken.length > 0) {
      await this.validateToken();
    }

    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async chat(messages: readonly ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    if (!this.connected) {
      throw new Error('OpenClawAdapter: not connected — call connect() first');
    }

    const url = `${this.config.gatewayUrl}/v1/chat/completions`;
    const effectiveTimeout = options?.timeout ?? this.timeout;
    const body = JSON.stringify({
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options?.temperature,
      max_tokens: options?.maxTokens,
      stream: false,
      ...(this.config.agentId != null ? { agent_id: this.config.agentId } : {}),
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), effectiveTimeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        const rawBody: unknown = await response.json().catch(() => null);
        const errorMessage =
          isOpenAIError(rawBody) && rawBody.error?.message != null
            ? rawBody.error.message
            : `HTTP ${response.status}`;
        throw new Error(`OpenClawAdapter: ${errorMessage}`);
      }

      const rawBody: unknown = await response.json();
      if (!isOpenAIResponse(rawBody)) {
        throw new Error('OpenClawAdapter: unexpected response format from gateway');
      }

      const choice = rawBody.choices[0];
      if (choice == null) {
        throw new Error('OpenClawAdapter: response contained no choices');
      }

      return {
        content: choice.message.content,
        finishReason: parseFinishReason(choice.finish_reason),
        usage: parseUsage(rawBody.usage),
      };
    } catch (err: unknown) {
      clearTimeout(timer);

      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(
          `OpenClawAdapter: request timed out after ${effectiveTimeout}ms`,
        );
      }

      if (err instanceof Error && err.message.startsWith('OpenClawAdapter:')) {
        throw err;
      }

      throw new Error(
        `OpenClawAdapter: unexpected error — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  getCapabilities(): AdapterCapabilities {
    // Return a conservative default; a future version can query the gateway's
    // /v1/capabilities endpoint and cache the result during connect().
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
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (this.config.botToken != null && this.config.botToken.length > 0) {
      headers['Authorization'] = `Bearer ${this.config.botToken}`;
    }
    return headers;
  }

  private async validateToken(): Promise<void> {
    const url = `${this.config.gatewayUrl}/v1/auth/validate`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({}),
        signal: controller.signal,
      });
      clearTimeout(timer);

      // 404 means gateway doesn't have an auth endpoint — treat as passing.
      if (response.status === 404) return;

      if (response.status === 401 || response.status === 403) {
        throw new Error('OpenClawAdapter: authentication failed — check botToken');
      }
    } catch (err: unknown) {
      clearTimeout(timer);
      if (err instanceof Error && err.message.startsWith('OpenClawAdapter:')) throw err;
      // Ignore network errors during token validation — detect() already confirmed reachability.
    }
  }

  /**
   * Fetches capabilities from the gateway when available.
   * Reserved for future use; callers may call this after connect() to get
   * live capabilities instead of the static defaults.
   */
  async fetchCapabilities(): Promise<AdapterCapabilities> {
    const url = `${this.config.gatewayUrl}/v1/capabilities`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.buildHeaders(),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) return this.getCapabilities();

      const body: unknown = await response.json().catch(() => null);
      if (!isOpenClawCapabilities(body)) return this.getCapabilities();

      return {
        streaming: body.streaming ?? false,
        functionCalling: body.functionCalling ?? false,
        vision: body.vision ?? false,
        maxContextLength: body.maxContextLength ?? 8_192,
      };
    } catch {
      clearTimeout(timer);
      return this.getCapabilities();
    }
  }
}
