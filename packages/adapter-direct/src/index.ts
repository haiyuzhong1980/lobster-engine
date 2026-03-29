// @lobster-engine/adapter-direct
// Direct LLM adapter for OpenAI-compatible APIs (OpenAI, Claude via proxy, DeepSeek, Ollama, etc.)

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

export interface DirectAdapterConfig {
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly model: string;
  readonly timeout?: number;
  readonly maxRetries?: number;
}

// ---------------------------------------------------------------------------
// Internal OpenAI-format wire types (narrowed from unknown)
// ---------------------------------------------------------------------------

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

interface OpenAIError {
  error?: {
    message?: string;
    type?: string;
    code?: string | number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 500;

function isRetryable(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function derivePlatform(baseUrl: string): string {
  try {
    const { hostname } = new URL(baseUrl);
    if (hostname.includes('openai.com')) return 'openai';
    if (hostname.includes('anthropic.com')) return 'anthropic';
    if (hostname.includes('deepseek.com')) return 'deepseek';
    if (hostname === 'localhost' || hostname === '127.0.0.1') return 'local';
    return hostname;
  } catch {
    return 'unknown';
  }
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

function isOpenAIResponse(value: unknown): value is OpenAIResponse {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return Array.isArray(obj['choices']);
}

function isOpenAIError(value: unknown): value is OpenAIError {
  if (typeof value !== 'object' || value === null) return false;
  return 'error' in (value as Record<string, unknown>);
}

function getCapabilitiesForModel(model: string): AdapterCapabilities {
  const m = model.toLowerCase();
  const isGpt4 = m.includes('gpt-4') || m.includes('o1') || m.includes('o3');
  const isDeepSeek = m.includes('deepseek');
  const isClaude = m.includes('claude');
  const isVision =
    isGpt4 ||
    isClaude ||
    m.includes('vision') ||
    m.includes('llava') ||
    m.includes('qwen-vl');
  const isFunctionCalling =
    isGpt4 ||
    isDeepSeek ||
    isClaude ||
    m.includes('mistral') ||
    m.includes('qwen');

  let maxContextLength = 4_096;
  if (m.includes('128k') || m.includes('claude-3') || m.includes('gpt-4-turbo')) {
    maxContextLength = 128_000;
  } else if (m.includes('32k')) {
    maxContextLength = 32_768;
  } else if (m.includes('16k') || m.includes('gpt-3.5-turbo-16k')) {
    maxContextLength = 16_384;
  } else if (isGpt4 || isDeepSeek || m.includes('qwen')) {
    maxContextLength = 8_192;
  }

  return {
    streaming: false,
    functionCalling: isFunctionCalling,
    vision: isVision,
    maxContextLength,
  };
}

// ---------------------------------------------------------------------------
// DirectLLMAdapter
// ---------------------------------------------------------------------------

export class DirectLLMAdapter implements AIPlatformAdapter {
  readonly name = 'direct-llm';
  readonly platform: string;

  private readonly config: DirectAdapterConfig;
  private readonly timeout: number;
  private readonly maxRetries: number;

  constructor(config: DirectAdapterConfig) {
    this.config = config;
    this.platform = derivePlatform(config.baseUrl);
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  // -------------------------------------------------------------------------
  // AIPlatformAdapter implementation
  // -------------------------------------------------------------------------

  async detect(): Promise<boolean> {
    const url = `${this.config.baseUrl}/models`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);
      try {
        const response = await fetch(url, {
          method: 'HEAD',
          headers: this.buildHeaders(),
          signal: controller.signal,
        });
        return response.ok || response.status === 401;
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
        `DirectLLMAdapter: cannot reach ${this.config.baseUrl} — check baseUrl and network connectivity`,
      );
    }
  }

  async disconnect(): Promise<void> {
    // Stateless HTTP adapter — nothing to tear down.
  }

  async chat(messages: readonly ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const effectiveTimeout = options?.timeout ?? this.timeout;
    const body = JSON.stringify({
      model: this.config.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options?.temperature,
      max_tokens: options?.maxTokens,
      stream: false,
    });

    return this.fetchWithRetry(body, effectiveTimeout);
  }

  getCapabilities(): AdapterCapabilities {
    return getCapabilitiesForModel(this.config.model);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (this.config.apiKey != null && this.config.apiKey.length > 0) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    return headers;
  }

  private async fetchWithRetry(body: string, timeoutMs: number): Promise<ChatResponse> {
    const url = `${this.config.baseUrl}/chat/completions`;
    let lastError: Error = new Error('DirectLLMAdapter: unexpected retry failure');

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
              `DirectLLMAdapter: HTTP ${response.status} — will retry (attempt ${attempt + 1}/${this.maxRetries})`,
            );
            continue;
          }

          const rawBody: unknown = await response.json().catch(() => null);
          const errorMessage =
            isOpenAIError(rawBody) && rawBody.error?.message != null
              ? rawBody.error.message
              : `HTTP ${response.status}`;

          throw new Error(`DirectLLMAdapter: ${errorMessage}`);
        }

        const rawBody: unknown = await response.json();
        if (!isOpenAIResponse(rawBody)) {
          throw new Error('DirectLLMAdapter: unexpected response format from server');
        }

        const choice = rawBody.choices[0];
        if (choice == null) {
          throw new Error('DirectLLMAdapter: response contained no choices');
        }

        return {
          content: choice.message.content,
          finishReason: parseFinishReason(choice.finish_reason),
          usage: parseUsage(rawBody.usage),
        };
      } catch (err: unknown) {
        clearTimeout(timer);

        if (err instanceof Error && err.name === 'AbortError') {
          lastError = new Error(
            `DirectLLMAdapter: request timed out after ${timeoutMs}ms (attempt ${attempt + 1})`,
          );
          if (attempt < this.maxRetries) continue;
        }

        if (err instanceof Error && err.message.startsWith('DirectLLMAdapter:')) {
          throw err;
        }

        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < this.maxRetries) continue;
      }
    }

    throw lastError;
  }
}
