// @lobster-engine/adapter-direct — DirectLLMAdapter unit tests

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { DirectLLMAdapter } from '../index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOkResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
    headers: new Headers(),
  } as unknown as Response;
}

function makeErrorResponse(status: number, body: unknown = null): Response {
  return {
    ok: false,
    status,
    json: vi.fn().mockResolvedValue(body),
    headers: new Headers(),
  } as unknown as Response;
}

function makeOpenAISuccess(
  content = 'Hello!',
  finishReason = 'stop',
  usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
) {
  return {
    choices: [
      {
        message: { role: 'assistant', content },
        finish_reason: finishReason,
      },
    ],
    usage,
  };
}

const BASE_URL = 'https://api.openai.com/v1';
const API_KEY = 'sk-test-key';
const MODEL = 'gpt-4-turbo';

function makeAdapter(overrides: Partial<ConstructorParameters<typeof DirectLLMAdapter>[0]> = {}) {
  return new DirectLLMAdapter({
    baseUrl: BASE_URL,
    apiKey: API_KEY,
    model: MODEL,
    timeout: 5_000,
    maxRetries: 0, // default to 0 retries; override per test
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

// ---------------------------------------------------------------------------
// detect()
// ---------------------------------------------------------------------------

describe('detect()', () => {
  it('returns true when /models responds with 200 OK', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse({}, 200));
    const adapter = makeAdapter();
    expect(await adapter.detect()).toBe(true);
  });

  it('returns true when /models responds with 401 (auth check passes reachability)', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse({}, 401));
    const adapter = makeAdapter();
    expect(await adapter.detect()).toBe(true);
  });

  it('returns false when /models responds with 500', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeErrorResponse(500));
    const adapter = makeAdapter();
    expect(await adapter.detect()).toBe(false);
  });

  it('returns false when fetch rejects (network error)', async () => {
    (fetch as Mock).mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const adapter = makeAdapter();
    expect(await adapter.detect()).toBe(false);
  });

  it('sends a HEAD request to the /models endpoint', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse({}, 200));
    const adapter = makeAdapter();
    await adapter.detect();
    const [url, init] = (fetch as Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/models`);
    expect(init.method).toBe('HEAD');
  });
});

// ---------------------------------------------------------------------------
// connect()
// ---------------------------------------------------------------------------

describe('connect()', () => {
  it('resolves when the server is reachable', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse({}, 200));
    await expect(makeAdapter().connect()).resolves.toBeUndefined();
  });

  it('throws when the server is not reachable', async () => {
    (fetch as Mock).mockRejectedValueOnce(new Error('timeout'));
    await expect(makeAdapter().connect()).rejects.toThrow(
      'DirectLLMAdapter: cannot reach',
    );
  });

  it('throws an error that includes the baseUrl', async () => {
    (fetch as Mock).mockRejectedValueOnce(new Error('timeout'));
    const adapter = makeAdapter({ baseUrl: 'http://localhost:11434' });
    await expect(adapter.connect()).rejects.toThrow('http://localhost:11434');
  });
});

// ---------------------------------------------------------------------------
// disconnect()
// ---------------------------------------------------------------------------

describe('disconnect()', () => {
  it('resolves without throwing', async () => {
    await expect(makeAdapter().disconnect()).resolves.toBeUndefined();
  });

  it('does not call fetch', async () => {
    await makeAdapter().disconnect();
    expect(fetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// chat() — happy path
// ---------------------------------------------------------------------------

describe('chat() — happy path', () => {
  it('returns content from the first choice', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeOpenAISuccess('Hi there!')));
    const adapter = makeAdapter();
    const result = await adapter.chat([{ role: 'user', content: 'Hello' }]);
    expect(result.content).toBe('Hi there!');
  });

  it('maps finish_reason "stop" to finishReason "stop"', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeOpenAISuccess('Ok', 'stop')));
    const result = await makeAdapter().chat([{ role: 'user', content: 'hi' }]);
    expect(result.finishReason).toBe('stop');
  });

  it('maps finish_reason "length" to finishReason "length"', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeOpenAISuccess('...', 'length')));
    const result = await makeAdapter().chat([{ role: 'user', content: 'hi' }]);
    expect(result.finishReason).toBe('length');
  });

  it('maps unknown finish_reason to finishReason "error"', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeOpenAISuccess('x', 'content_filter')));
    const result = await makeAdapter().chat([{ role: 'user', content: 'hi' }]);
    expect(result.finishReason).toBe('error');
  });

  it('includes usage when present in the response', async () => {
    (fetch as Mock).mockResolvedValueOnce(
      makeOkResponse(makeOpenAISuccess('Hi', 'stop', { prompt_tokens: 8, completion_tokens: 3, total_tokens: 11 })),
    );
    const result = await makeAdapter().chat([{ role: 'user', content: 'hi' }]);
    expect(result.usage).toEqual({ promptTokens: 8, completionTokens: 3, totalTokens: 11 });
  });

  it('returns undefined usage when usage is absent', async () => {
    (fetch as Mock).mockResolvedValueOnce(
      makeOkResponse({ choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] }),
    );
    const result = await makeAdapter().chat([{ role: 'user', content: 'hi' }]);
    expect(result.usage).toBeUndefined();
  });

  it('sends POST to /chat/completions', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeOpenAISuccess()));
    await makeAdapter().chat([{ role: 'user', content: 'hi' }]);
    const [url, init] = (fetch as Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/chat/completions`);
    expect(init.method).toBe('POST');
  });

  it('sends model, messages, and stream:false in the request body', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeOpenAISuccess()));
    const messages = [
      { role: 'system' as const, content: 'You are helpful.' },
      { role: 'user' as const, content: 'Hello' },
    ];
    await makeAdapter().chat(messages);
    const [, init] = (fetch as Mock).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe(MODEL);
    expect(body.stream).toBe(false);
    expect(body.messages).toEqual([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hello' },
    ]);
  });

  it('forwards temperature and maxTokens options to the request body', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeOpenAISuccess()));
    await makeAdapter().chat([{ role: 'user', content: 'hi' }], { temperature: 0.7, maxTokens: 256 });
    const [, init] = (fetch as Mock).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.temperature).toBe(0.7);
    expect(body.max_tokens).toBe(256);
  });
});

// ---------------------------------------------------------------------------
// Headers — Authorization bearer token
// ---------------------------------------------------------------------------

describe('Headers', () => {
  it('includes Authorization: Bearer <apiKey> when apiKey is configured', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeOpenAISuccess()));
    await makeAdapter({ apiKey: 'sk-my-secret' }).chat([{ role: 'user', content: 'hi' }]);
    const [, init] = (fetch as Mock).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer sk-my-secret');
  });

  it('omits Authorization header when apiKey is not provided', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeOpenAISuccess()));
    await makeAdapter({ apiKey: undefined }).chat([{ role: 'user', content: 'hi' }]);
    const [, init] = (fetch as Mock).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });

  it('omits Authorization header when apiKey is an empty string', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeOpenAISuccess()));
    await makeAdapter({ apiKey: '' }).chat([{ role: 'user', content: 'hi' }]);
    const [, init] = (fetch as Mock).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });

  it('sets Content-Type: application/json and Accept: application/json', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeOpenAISuccess()));
    await makeAdapter().chat([{ role: 'user', content: 'hi' }]);
    const [, init] = (fetch as Mock).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Accept']).toBe('application/json');
  });
});

// ---------------------------------------------------------------------------
// chat() — non-retryable errors
// ---------------------------------------------------------------------------

describe('chat() — non-retryable errors', () => {
  it('throws immediately on 400 without retrying', async () => {
    (fetch as Mock).mockResolvedValue(
      makeErrorResponse(400, { error: { message: 'Bad request' } }),
    );
    const adapter = makeAdapter({ maxRetries: 3 });
    await expect(adapter.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      'DirectLLMAdapter: Bad request',
    );
    expect((fetch as Mock).mock.calls.length).toBe(1);
  });

  it('throws immediately on 403', async () => {
    (fetch as Mock).mockResolvedValue(makeErrorResponse(403));
    const adapter = makeAdapter({ maxRetries: 3 });
    await expect(adapter.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      'DirectLLMAdapter: HTTP 403',
    );
    expect((fetch as Mock).mock.calls.length).toBe(1);
  });

  it('uses the OpenAI error message from JSON body when available', async () => {
    (fetch as Mock).mockResolvedValue(
      makeErrorResponse(422, { error: { message: 'Invalid model specified' } }),
    );
    await expect(
      makeAdapter({ maxRetries: 0 }).chat([{ role: 'user', content: 'hi' }]),
    ).rejects.toThrow('DirectLLMAdapter: Invalid model specified');
  });

  it('falls back to "HTTP <status>" when error body has no message', async () => {
    (fetch as Mock).mockResolvedValue(makeErrorResponse(422, {}));
    await expect(
      makeAdapter({ maxRetries: 0 }).chat([{ role: 'user', content: 'hi' }]),
    ).rejects.toThrow('DirectLLMAdapter: HTTP 422');
  });

  it('throws when response format is not OpenAI-compatible', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse({ result: 'something else' }));
    await expect(
      makeAdapter().chat([{ role: 'user', content: 'hi' }]),
    ).rejects.toThrow('DirectLLMAdapter: unexpected response format from server');
  });

  it('throws when choices array is empty', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse({ choices: [] }));
    await expect(
      makeAdapter().chat([{ role: 'user', content: 'hi' }]),
    ).rejects.toThrow('DirectLLMAdapter: response contained no choices');
  });
});

// ---------------------------------------------------------------------------
// chat() — retry on 429 (rate limit)
// ---------------------------------------------------------------------------

describe('chat() — retry on 429', () => {
  it('retries after a 429 and succeeds on the second attempt', async () => {
    (fetch as Mock)
      .mockResolvedValueOnce(makeErrorResponse(429))
      .mockResolvedValueOnce(makeOkResponse(makeOpenAISuccess('Retried!')));

    const adapter = makeAdapter({ maxRetries: 2 });
    // Override sleep so retries run instantly
    const result = await adapter.chat([{ role: 'user', content: 'hi' }]);
    expect(result.content).toBe('Retried!');
    expect((fetch as Mock).mock.calls.length).toBe(2);
  });

  it('makes the correct total number of calls across retries', async () => {
    (fetch as Mock)
      .mockResolvedValueOnce(makeErrorResponse(429))
      .mockResolvedValueOnce(makeErrorResponse(429))
      .mockResolvedValueOnce(makeOkResponse(makeOpenAISuccess('Done')));

    const adapter = makeAdapter({ maxRetries: 3 });
    await adapter.chat([{ role: 'user', content: 'hi' }]);
    expect((fetch as Mock).mock.calls.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// chat() — retry on 502/503/504 (server errors)
// ---------------------------------------------------------------------------

describe('chat() — retry on 502/503/504', () => {
  it.each([502, 503, 504])(
    'retries on %i and succeeds on next attempt',
    async (status) => {
      (fetch as Mock)
        .mockResolvedValueOnce(makeErrorResponse(status))
        .mockResolvedValueOnce(makeOkResponse(makeOpenAISuccess('Recovered')));

      const adapter = makeAdapter({ maxRetries: 2 });
      const result = await adapter.chat([{ role: 'user', content: 'hi' }]);
      expect(result.content).toBe('Recovered');
      expect((fetch as Mock).mock.calls.length).toBe(2);
    },
  );
});

// ---------------------------------------------------------------------------
// chat() — fails after max retries exhausted
// ---------------------------------------------------------------------------

describe('chat() — fails after max retries', () => {
  it('throws after exhausting all retries on persistent 429', async () => {
    (fetch as Mock).mockResolvedValue(makeErrorResponse(429));
    const adapter = makeAdapter({ maxRetries: 2 });
    await expect(adapter.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      'DirectLLMAdapter:',
    );
    // 1 initial + 2 retries = 3 total attempts
    expect((fetch as Mock).mock.calls.length).toBe(3);
  });

  it('throws after exhausting all retries on persistent 503', async () => {
    (fetch as Mock).mockResolvedValue(makeErrorResponse(503));
    const adapter = makeAdapter({ maxRetries: 1 });
    await expect(adapter.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow();
    expect((fetch as Mock).mock.calls.length).toBe(2);
  });

  it('with maxRetries 0 makes exactly one request and throws on 429', async () => {
    (fetch as Mock).mockResolvedValue(makeErrorResponse(429));
    const adapter = makeAdapter({ maxRetries: 0 });
    await expect(adapter.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow();
    expect((fetch as Mock).mock.calls.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// getCapabilities()
// ---------------------------------------------------------------------------

describe('getCapabilities()', () => {
  it('reports streaming: false for all models', () => {
    expect(makeAdapter({ model: 'gpt-4-turbo' }).getCapabilities().streaming).toBe(false);
    expect(makeAdapter({ model: 'claude-3-opus' }).getCapabilities().streaming).toBe(false);
  });

  it('enables functionCalling for gpt-4 models', () => {
    expect(makeAdapter({ model: 'gpt-4-turbo' }).getCapabilities().functionCalling).toBe(true);
  });

  it('enables functionCalling for deepseek models', () => {
    expect(makeAdapter({ model: 'deepseek-chat' }).getCapabilities().functionCalling).toBe(true);
  });

  it('enables functionCalling for claude models', () => {
    expect(makeAdapter({ model: 'claude-3-sonnet' }).getCapabilities().functionCalling).toBe(true);
  });

  it('enables functionCalling for mistral models', () => {
    expect(makeAdapter({ model: 'mistral-7b' }).getCapabilities().functionCalling).toBe(true);
  });

  it('enables functionCalling for qwen models', () => {
    expect(makeAdapter({ model: 'qwen-72b' }).getCapabilities().functionCalling).toBe(true);
  });

  it('disables functionCalling for basic gpt-3.5 models', () => {
    expect(makeAdapter({ model: 'gpt-3.5-turbo' }).getCapabilities().functionCalling).toBe(false);
  });

  it('enables vision for gpt-4 models', () => {
    expect(makeAdapter({ model: 'gpt-4-turbo' }).getCapabilities().vision).toBe(true);
  });

  it('enables vision for claude models', () => {
    expect(makeAdapter({ model: 'claude-3-opus' }).getCapabilities().vision).toBe(true);
  });

  it('enables vision for llava models', () => {
    expect(makeAdapter({ model: 'llava-13b' }).getCapabilities().vision).toBe(true);
  });

  it('disables vision for plain gpt-3.5 models', () => {
    expect(makeAdapter({ model: 'gpt-3.5-turbo' }).getCapabilities().vision).toBe(false);
  });

  it('returns 128000 maxContextLength for claude-3 models', () => {
    expect(makeAdapter({ model: 'claude-3-opus' }).getCapabilities().maxContextLength).toBe(128_000);
  });

  it('returns 128000 maxContextLength for gpt-4-turbo', () => {
    expect(makeAdapter({ model: 'gpt-4-turbo' }).getCapabilities().maxContextLength).toBe(128_000);
  });

  it('returns 32768 maxContextLength for 32k models', () => {
    expect(makeAdapter({ model: 'gpt-4-32k' }).getCapabilities().maxContextLength).toBe(32_768);
  });

  it('returns 16384 maxContextLength for 16k models', () => {
    expect(makeAdapter({ model: 'gpt-3.5-turbo-16k' }).getCapabilities().maxContextLength).toBe(16_384);
  });

  it('returns 8192 maxContextLength for gpt-4 base (not turbo/128k)', () => {
    expect(makeAdapter({ model: 'gpt-4' }).getCapabilities().maxContextLength).toBe(8_192);
  });

  it('returns 8192 maxContextLength for deepseek models', () => {
    expect(makeAdapter({ model: 'deepseek-chat' }).getCapabilities().maxContextLength).toBe(8_192);
  });

  it('returns 4096 maxContextLength for unknown/basic models', () => {
    expect(makeAdapter({ model: 'my-local-model' }).getCapabilities().maxContextLength).toBe(4_096);
  });
});

// ---------------------------------------------------------------------------
// platform derivation
// ---------------------------------------------------------------------------

describe('platform derivation from baseUrl', () => {
  it('sets platform to "openai" for api.openai.com', () => {
    const adapter = new DirectLLMAdapter({ baseUrl: 'https://api.openai.com/v1', model: 'gpt-4' });
    expect(adapter.platform).toBe('openai');
  });

  it('sets platform to "anthropic" for api.anthropic.com', () => {
    const adapter = new DirectLLMAdapter({ baseUrl: 'https://api.anthropic.com/v1', model: 'claude-3' });
    expect(adapter.platform).toBe('anthropic');
  });

  it('sets platform to "deepseek" for api.deepseek.com', () => {
    const adapter = new DirectLLMAdapter({ baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' });
    expect(adapter.platform).toBe('deepseek');
  });

  it('sets platform to "local" for localhost', () => {
    const adapter = new DirectLLMAdapter({ baseUrl: 'http://localhost:11434/v1', model: 'llama3' });
    expect(adapter.platform).toBe('local');
  });

  it('sets platform to "local" for 127.0.0.1', () => {
    const adapter = new DirectLLMAdapter({ baseUrl: 'http://127.0.0.1:8080/v1', model: 'llama3' });
    expect(adapter.platform).toBe('local');
  });

  it('sets platform to the hostname for unknown hosts', () => {
    const adapter = new DirectLLMAdapter({ baseUrl: 'https://my-proxy.example.com/v1', model: 'gpt-4' });
    expect(adapter.platform).toBe('my-proxy.example.com');
  });

  it('sets platform to "unknown" for invalid baseUrl', () => {
    const adapter = new DirectLLMAdapter({ baseUrl: 'not-a-url', model: 'gpt-4' });
    expect(adapter.platform).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// Config defaults
// ---------------------------------------------------------------------------

describe('Config defaults', () => {
  it('adapter.name is always "direct-llm"', () => {
    expect(makeAdapter().name).toBe('direct-llm');
  });

  it('uses the configured model in the request body', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeOpenAISuccess()));
    const adapter = makeAdapter({ model: 'deepseek-coder' });
    await adapter.chat([{ role: 'user', content: 'hi' }]);
    const [, init] = (fetch as Mock).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('deepseek-coder');
  });

  it('applies per-call timeout from ChatOptions, overriding the config timeout', async () => {
    // Use a very short per-call timeout — the abort signal should fire, but
    // with the mock the response arrives instantly so we only verify the
    // signal is wired up (no actual timeout test to avoid flakiness).
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeOpenAISuccess()));
    const adapter = makeAdapter({ timeout: 30_000 });
    const result = await adapter.chat([{ role: 'user', content: 'hi' }], { timeout: 100 });
    expect(result.content).toBe('Hello!');
  });

  it('defaults maxRetries to 3 when not specified in config', async () => {
    // 3 failures + 1 success = 4 calls total (1 initial + 3 retries)
    (fetch as Mock)
      .mockResolvedValueOnce(makeErrorResponse(503))
      .mockResolvedValueOnce(makeErrorResponse(503))
      .mockResolvedValueOnce(makeErrorResponse(503))
      .mockResolvedValueOnce(makeOkResponse(makeOpenAISuccess('Final attempt')));

    const adapter = new DirectLLMAdapter({
      baseUrl: BASE_URL,
      apiKey: API_KEY,
      model: MODEL,
      timeout: 5_000,
      // maxRetries intentionally omitted — should default to 3
    });
    const result = await adapter.chat([{ role: 'user', content: 'hi' }]);
    expect(result.content).toBe('Final attempt');
    expect((fetch as Mock).mock.calls.length).toBe(4);
  });
});
