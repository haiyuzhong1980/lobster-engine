// @lobster-engine/adapter-dify — DifyAdapter unit tests

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { DifyAdapter } from '../index.js';

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

function makeDifyChatSuccess(
  answer = 'Hello from Dify!',
  conversationId = 'conv-abc',
  usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number },
): unknown {
  return {
    answer,
    conversation_id: conversationId,
    message_id: 'msg-xyz',
    metadata: {
      usage: usage ?? { total_tokens: 15, prompt_tokens: 10, completion_tokens: 5 },
    },
  };
}

/** A minimal valid Dify parameters response body */
function makeParametersSuccess(): unknown {
  return { opening_statement: '', more_like_this: { enabled: false } };
}

const API_KEY = 'app-test-dify-key';

function makeAdapter(overrides: Partial<ConstructorParameters<typeof DifyAdapter>[0]> = {}) {
  return new DifyAdapter({
    apiKey: API_KEY,
    timeout: 5_000,
    maxRetries: 0,
    ...overrides,
  });
}

/**
 * Returns a connected adapter. connect() calls validateApiKey() → GET /parameters.
 */
async function makeConnectedAdapter(
  overrides: Partial<ConstructorParameters<typeof DifyAdapter>[0]> = {},
): Promise<DifyAdapter> {
  (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeParametersSuccess()));
  const adapter = makeAdapter(overrides);
  await adapter.connect();
  return adapter;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

// ---------------------------------------------------------------------------
// name and platform properties
// ---------------------------------------------------------------------------

describe('name and platform properties', () => {
  it('name is "dify"', () => {
    expect(makeAdapter().name).toBe('dify');
  });

  it('platform is "dify"', () => {
    expect(makeAdapter().platform).toBe('dify');
  });
});

// ---------------------------------------------------------------------------
// detect()
// ---------------------------------------------------------------------------

describe('detect()', () => {
  it('returns true when parameters endpoint responds with 200 OK', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeParametersSuccess()));
    expect(await makeAdapter().detect()).toBe(true);
  });

  it('returns true when server returns 401 (reachable but unauthorized)', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse({}, 401));
    expect(await makeAdapter().detect()).toBe(true);
  });

  it('returns true when server returns 403', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse({}, 403));
    expect(await makeAdapter().detect()).toBe(true);
  });

  it('returns false when fetch rejects (network error)', async () => {
    (fetch as Mock).mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect(await makeAdapter().detect()).toBe(false);
  });

  it('returns false when fetch rejects with AbortError (timeout)', async () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    (fetch as Mock).mockRejectedValueOnce(err);
    expect(await makeAdapter().detect()).toBe(false);
  });

  it('returns false when apiKey is empty', async () => {
    expect(await makeAdapter({ apiKey: '' }).detect()).toBe(false);
  });

  it('sends a GET request to <apiBase>/parameters', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeParametersSuccess()));
    await makeAdapter().detect();
    const [url, init] = (fetch as Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/parameters');
    expect(init.method).toBe('GET');
  });

  it('includes Authorization: Bearer <apiKey> in the detect request', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeParametersSuccess()));
    await makeAdapter({ apiKey: 'app-detect-key' }).detect();
    const [, init] = (fetch as Mock).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer app-detect-key');
  });
});

// ---------------------------------------------------------------------------
// connect()
// ---------------------------------------------------------------------------

describe('connect()', () => {
  it('resolves when parameters endpoint is reachable', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeParametersSuccess()));
    await expect(makeAdapter().connect()).resolves.toBeUndefined();
  });

  it('resolves when parameters endpoint returns 404 (endpoint not present)', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeErrorResponse(404));
    await expect(makeAdapter().connect()).resolves.toBeUndefined();
  });

  it('throws when apiKey is empty', async () => {
    await expect(makeAdapter({ apiKey: '' }).connect()).rejects.toThrow(
      'DifyAdapter: apiKey is required',
    );
  });

  it('throws when parameters endpoint returns 401', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeErrorResponse(401));
    await expect(makeAdapter().connect()).rejects.toThrow(
      'DifyAdapter: authentication failed — check apiKey',
    );
  });

  it('throws when parameters endpoint returns 403', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeErrorResponse(403));
    await expect(makeAdapter().connect()).rejects.toThrow(
      'DifyAdapter: authentication failed — check apiKey',
    );
  });

  it('throws when parameters endpoint returns 500', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeErrorResponse(500));
    await expect(makeAdapter().connect()).rejects.toThrow('DifyAdapter:');
  });

  it('throws when fetch rejects during connect', async () => {
    (fetch as Mock).mockRejectedValueOnce(new Error('network down'));
    await expect(makeAdapter().connect()).rejects.toThrow('DifyAdapter: connect failed');
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

  it('allows reconnect after disconnect', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeParametersSuccess()));
    const adapter = makeAdapter();
    await adapter.connect();
    await adapter.disconnect();

    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeParametersSuccess()));
    await expect(adapter.connect()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// chat() — not connected guard
// ---------------------------------------------------------------------------

describe('chat() — not connected guard', () => {
  it('throws when called before connect()', async () => {
    await expect(
      makeAdapter().chat([{ role: 'user', content: 'hello' }]),
    ).rejects.toThrow('DifyAdapter: not connected — call connect() first');
  });

  it('throws after disconnect()', async () => {
    const adapter = await makeConnectedAdapter();
    await adapter.disconnect();
    await expect(
      adapter.chat([{ role: 'user', content: 'hello' }]),
    ).rejects.toThrow('DifyAdapter: not connected');
  });
});

// ---------------------------------------------------------------------------
// chat() — happy path
// ---------------------------------------------------------------------------

describe('chat() — happy path', () => {
  it('returns the answer content from Dify response', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeDifyChatSuccess('Hi from Dify!')));
    const result = await adapter.chat([{ role: 'user', content: 'Hello' }]);
    expect(result.content).toBe('Hi from Dify!');
  });

  it('always returns finishReason "stop"', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeDifyChatSuccess()));
    const result = await adapter.chat([{ role: 'user', content: 'hi' }]);
    expect(result.finishReason).toBe('stop');
  });

  it('includes parsed usage when present', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(
      makeOkResponse(
        makeDifyChatSuccess('hi', 'conv-1', { total_tokens: 20, prompt_tokens: 12, completion_tokens: 8 }),
      ),
    );
    const result = await adapter.chat([{ role: 'user', content: 'hi' }]);
    expect(result.usage).toEqual({ promptTokens: 12, completionTokens: 8, totalTokens: 20 });
  });

  it('returns undefined usage when metadata usage is absent', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(
      makeOkResponse({ answer: 'ok', conversation_id: 'conv-1', message_id: 'msg-1' }),
    );
    const result = await adapter.chat([{ role: 'user', content: 'hi' }]);
    expect(result.usage).toBeUndefined();
  });

  it('sends POST to <apiBase>/chat-messages', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeDifyChatSuccess()));
    await adapter.chat([{ role: 'user', content: 'hi' }]);
    // calls[1] because connect() consumed calls[0] (/parameters)
    const [url, init] = (fetch as Mock).mock.calls[1] as [string, RequestInit];
    expect(url).toContain('/chat-messages');
    expect(init.method).toBe('POST');
  });

  it('sends inputs, user, and response_mode: "blocking" in the body', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeDifyChatSuccess()));
    await adapter.chat([{ role: 'user', content: 'hello' }]);
    const [, init] = (fetch as Mock).mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.inputs).toEqual({});
    expect(body.user).toBeDefined();
    expect(body.response_mode).toBe('blocking');
    expect(body.query).toBe('hello');
  });

  it('sends query as the last user message content for single-turn', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeDifyChatSuccess()));
    await adapter.chat([{ role: 'user', content: 'What is 2+2?' }]);
    const [, init] = (fetch as Mock).mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.query).toBe('What is 2+2?');
  });

  it('excludes system messages from the query', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeDifyChatSuccess()));
    await adapter.chat([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hello!' },
    ]);
    const [, init] = (fetch as Mock).mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.query).not.toContain('You are helpful.');
    expect(body.query).toContain('Hello!');
  });

  it('includes conversation_id on subsequent turns', async () => {
    const adapter = await makeConnectedAdapter();
    // First turn — captures conversation_id
    (fetch as Mock).mockResolvedValueOnce(
      makeOkResponse(makeDifyChatSuccess('First reply', 'conv-multi-turn')),
    );
    await adapter.chat([{ role: 'user', content: 'First message' }]);

    // Second turn — should include conversation_id
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeDifyChatSuccess('Second reply')));
    await adapter.chat([{ role: 'user', content: 'Second message' }]);

    const [, init] = (fetch as Mock).mock.calls[2] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.conversation_id).toBe('conv-multi-turn');
  });

  it('omits conversation_id on the first turn', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeDifyChatSuccess()));
    await adapter.chat([{ role: 'user', content: 'hi' }]);
    const [, init] = (fetch as Mock).mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.conversation_id).toBeUndefined();
  });

  it('includes conversation_id in response metadata', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(
      makeOkResponse(makeDifyChatSuccess('hi', 'conv-meta-test')),
    );
    const result = await adapter.chat([{ role: 'user', content: 'hi' }]);
    expect(result.metadata?.['conversationId']).toBe('conv-meta-test');
  });

  it('includes Authorization: Bearer <apiKey> header in chat requests', async () => {
    const adapter = await makeConnectedAdapter({ apiKey: 'app-chat-secret' });
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeDifyChatSuccess()));
    await adapter.chat([{ role: 'user', content: 'hi' }]);
    const [, init] = (fetch as Mock).mock.calls[1] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer app-chat-secret');
  });

  it('sets Content-Type: application/json and Accept: application/json', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeDifyChatSuccess()));
    await adapter.chat([{ role: 'user', content: 'hi' }]);
    const [, init] = (fetch as Mock).mock.calls[1] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Accept']).toBe('application/json');
  });

  it('uses the default user identifier when user is not configured', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeDifyChatSuccess()));
    await adapter.chat([{ role: 'user', content: 'hi' }]);
    const [, init] = (fetch as Mock).mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.user).toBe('lobster-engine');
  });

  it('uses the configured user identifier when provided', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeParametersSuccess()));
    const adapter = makeAdapter({ user: 'custom-user-42' });
    await adapter.connect();
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeDifyChatSuccess()));
    await adapter.chat([{ role: 'user', content: 'hi' }]);
    const [, init] = (fetch as Mock).mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.user).toBe('custom-user-42');
  });

  it('uses apiUrl override as the base URL', async () => {
    const customBase = 'https://dify.my-proxy.com/v1';
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeParametersSuccess()));
    const adapter = makeAdapter({ apiUrl: customBase });
    await adapter.connect();
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeDifyChatSuccess()));
    await adapter.chat([{ role: 'user', content: 'hi' }]);
    const [url] = (fetch as Mock).mock.calls[1] as [string];
    expect(url).toContain(customBase);
  });

  it('resets conversation_id after disconnect + reconnect', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(
      makeOkResponse(makeDifyChatSuccess('reply', 'conv-old')),
    );
    await adapter.chat([{ role: 'user', content: 'first' }]);
    await adapter.disconnect();

    // Reconnect
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeParametersSuccess()));
    await adapter.connect();

    // New session — should not send old conversation_id
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeDifyChatSuccess()));
    await adapter.chat([{ role: 'user', content: 'fresh start' }]);
    const [, init] = (fetch as Mock).mock.calls[3] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.conversation_id).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// chat() — error responses
// ---------------------------------------------------------------------------

describe('chat() — error responses', () => {
  it('throws on HTTP 400 with error message from body', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(
      makeErrorResponse(400, { message: 'Invalid query parameter' }),
    );
    await expect(adapter.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      'DifyAdapter: Invalid query parameter',
    );
  });

  it('throws on HTTP 400 falling back to "HTTP 400" when no error body', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(makeErrorResponse(400, {}));
    await expect(adapter.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      'DifyAdapter: HTTP 400',
    );
  });

  it('throws on HTTP 500 with fallback message', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(makeErrorResponse(500));
    await expect(adapter.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      'DifyAdapter: HTTP 500',
    );
  });

  it('throws when response format is unexpected (missing answer field)', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse({ result: 'unexpected' }));
    await expect(adapter.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      'DifyAdapter: unexpected response format from server',
    );
  });

  it('wraps unexpected fetch errors', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(adapter.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      'Failed to fetch',
    );
  });
});

// ---------------------------------------------------------------------------
// chat() — rate limit retry (429)
// ---------------------------------------------------------------------------

describe('chat() — retry on 429', () => {
  it('retries after a 429 and succeeds on the second attempt', async () => {
    const adapter = await makeConnectedAdapter({ maxRetries: 2 });
    (fetch as Mock)
      .mockResolvedValueOnce(makeErrorResponse(429))
      .mockResolvedValueOnce(makeOkResponse(makeDifyChatSuccess('Retried!')));

    const result = await adapter.chat([{ role: 'user', content: 'hi' }]);
    expect(result.content).toBe('Retried!');
    // connect = calls[0], 429 = calls[1], success = calls[2]
    expect((fetch as Mock).mock.calls.length).toBe(3);
  });

  it('throws after exhausting all retries on persistent 429', async () => {
    const adapter = await makeConnectedAdapter({ maxRetries: 2 });
    (fetch as Mock).mockResolvedValue(makeErrorResponse(429));
    await expect(adapter.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow('DifyAdapter:');
    // 1 initial + 2 retries = 3 chat attempts (plus 1 connect call)
    expect((fetch as Mock).mock.calls.length).toBe(4);
  });

  it('retries on 503 and succeeds', async () => {
    const adapter = await makeConnectedAdapter({ maxRetries: 2 });
    (fetch as Mock)
      .mockResolvedValueOnce(makeErrorResponse(503))
      .mockResolvedValueOnce(makeOkResponse(makeDifyChatSuccess('Recovered!')));

    const result = await adapter.chat([{ role: 'user', content: 'hi' }]);
    expect(result.content).toBe('Recovered!');
  });

  it('with maxRetries 0 makes exactly one chat request and throws on 429', async () => {
    const adapter = await makeConnectedAdapter({ maxRetries: 0 });
    (fetch as Mock).mockResolvedValue(makeErrorResponse(429));
    await expect(adapter.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow();
    // calls[0] = connect (/parameters), calls[1] = single chat attempt
    expect((fetch as Mock).mock.calls.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// chat() — timeout
// ---------------------------------------------------------------------------

describe('chat() — timeout', () => {
  it('throws a timeout error when fetch aborts', async () => {
    const adapter = await makeConnectedAdapter({ timeout: 100, maxRetries: 0 });
    const abortError = new Error('The operation was aborted.');
    abortError.name = 'AbortError';
    (fetch as Mock).mockRejectedValueOnce(abortError);
    await expect(adapter.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      'DifyAdapter: request timed out after 100ms',
    );
  });

  it('uses per-call timeout from ChatOptions over the config timeout', async () => {
    const adapter = await makeConnectedAdapter({ timeout: 30_000, maxRetries: 0 });
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    (fetch as Mock).mockRejectedValueOnce(abortError);
    await expect(
      adapter.chat([{ role: 'user', content: 'hi' }], { timeout: 250 }),
    ).rejects.toThrow('250ms');
  });
});

// ---------------------------------------------------------------------------
// getCapabilities()
// ---------------------------------------------------------------------------

describe('getCapabilities()', () => {
  it('returns streaming: false', () => {
    expect(makeAdapter().getCapabilities().streaming).toBe(false);
  });

  it('returns functionCalling: false', () => {
    expect(makeAdapter().getCapabilities().functionCalling).toBe(false);
  });

  it('returns vision: false', () => {
    expect(makeAdapter().getCapabilities().vision).toBe(false);
  });

  it('returns maxContextLength: 8192', () => {
    expect(makeAdapter().getCapabilities().maxContextLength).toBe(8_192);
  });

  it('does not call fetch', () => {
    makeAdapter().getCapabilities();
    expect(fetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Config defaults
// ---------------------------------------------------------------------------

describe('Config', () => {
  it('uses the default Dify API URL when apiUrl is not provided', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeParametersSuccess()));
    const adapter = makeAdapter();
    await adapter.connect();
    const [url] = (fetch as Mock).mock.calls[0] as [string];
    expect(url).toContain('api.dify.ai');
  });

  it('applies the default 30s timeout when no timeout is configured', async () => {
    const adapter = new DifyAdapter({ apiKey: API_KEY });
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeParametersSuccess()));
    await expect(adapter.connect()).resolves.toBeUndefined();
  });

  it('defaults maxRetries to 3 when not specified', async () => {
    const adapter = await makeConnectedAdapter({ maxRetries: undefined });
    (fetch as Mock)
      .mockResolvedValueOnce(makeErrorResponse(503))
      .mockResolvedValueOnce(makeErrorResponse(503))
      .mockResolvedValueOnce(makeErrorResponse(503))
      .mockResolvedValueOnce(makeOkResponse(makeDifyChatSuccess('Finally!')));

    const result = await adapter.chat([{ role: 'user', content: 'hi' }]);
    expect(result.content).toBe('Finally!');
  });
});
