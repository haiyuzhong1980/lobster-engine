// @lobster-engine/adapter-openclaw — OpenClawAdapter unit tests

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { OpenClawAdapter } from '../index.js';

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
  content = 'Hello from OpenClaw!',
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

const GATEWAY_URL = 'http://openclaw.example.com';
const BOT_TOKEN = 'test-bot-token';
const AGENT_ID = 'agent-123';

function makeAdapter(
  overrides: Partial<ConstructorParameters<typeof OpenClawAdapter>[0]> = {},
) {
  return new OpenClawAdapter({
    gatewayUrl: GATEWAY_URL,
    botToken: BOT_TOKEN,
    agentId: AGENT_ID,
    timeout: 5_000,
    ...overrides,
  });
}

/**
 * Returns a connected adapter, consuming the fetch calls needed for connect().
 * connect() calls detect() which hits /health, then validateToken() which hits
 * /v1/auth/validate (returning 200 by default).
 */
async function makeConnectedAdapter(
  overrides: Partial<ConstructorParameters<typeof OpenClawAdapter>[0]> = {},
): Promise<OpenClawAdapter> {
  // detect() → /health
  (fetch as Mock).mockResolvedValueOnce(makeOkResponse({ status: 'ok' }));
  // validateToken() → /v1/auth/validate  (200 = pass)
  (fetch as Mock).mockResolvedValueOnce(makeOkResponse({}, 200));
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
  it('name is "openclaw"', () => {
    expect(makeAdapter().name).toBe('openclaw');
  });

  it('platform is "openclaw"', () => {
    expect(makeAdapter().platform).toBe('openclaw');
  });
});

// ---------------------------------------------------------------------------
// detect()
// ---------------------------------------------------------------------------

describe('detect()', () => {
  it('returns true when /health responds with status "ok"', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse({ status: 'ok' }));
    expect(await makeAdapter().detect()).toBe(true);
  });

  it('returns true when /health responds with ok: true', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse({ ok: true }));
    expect(await makeAdapter().detect()).toBe(true);
  });

  it('returns true when /health responds with status "healthy"', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse({ status: 'healthy' }));
    expect(await makeAdapter().detect()).toBe(true);
  });

  it('returns false when /health responds with a non-200 status', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeErrorResponse(503));
    expect(await makeAdapter().detect()).toBe(false);
  });

  it('returns false when /health returns 200 but body indicates unhealthy status', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse({ status: 'degraded' }));
    expect(await makeAdapter().detect()).toBe(false);
  });

  it('returns false when fetch rejects (network error)', async () => {
    (fetch as Mock).mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect(await makeAdapter().detect()).toBe(false);
  });

  it('returns false when fetch rejects with AbortError (timeout)', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    (fetch as Mock).mockRejectedValueOnce(abortError);
    expect(await makeAdapter().detect()).toBe(false);
  });

  it('sends a GET request to <gatewayUrl>/health', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse({ status: 'ok' }));
    await makeAdapter().detect();
    const [url, init] = (fetch as Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${GATEWAY_URL}/health`);
    expect(init.method).toBe('GET');
  });

  it('falls back to true when /health returns 200 but JSON parse fails', async () => {
    const response = {
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(new SyntaxError('invalid json')),
      headers: new Headers(),
    } as unknown as Response;
    (fetch as Mock).mockResolvedValueOnce(response);
    // Implementation falls back to { ok: true } when json() rejects
    expect(await makeAdapter().detect()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// connect()
// ---------------------------------------------------------------------------

describe('connect()', () => {
  it('resolves when gateway is reachable and no botToken is configured', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse({ status: 'ok' }));
    // No botToken → no validateToken call
    const adapter = makeAdapter({ botToken: undefined });
    await expect(adapter.connect()).resolves.toBeUndefined();
  });

  it('resolves when gateway is reachable and token validation succeeds', async () => {
    (fetch as Mock)
      .mockResolvedValueOnce(makeOkResponse({ status: 'ok' })) // detect → /health
      .mockResolvedValueOnce(makeOkResponse({}, 200)); // validateToken → /v1/auth/validate
    await expect(makeAdapter().connect()).resolves.toBeUndefined();
  });

  it('resolves when token validation endpoint returns 404 (endpoint not present)', async () => {
    (fetch as Mock)
      .mockResolvedValueOnce(makeOkResponse({ status: 'ok' })) // detect → /health
      .mockResolvedValueOnce(makeErrorResponse(404)); // validateToken → 404
    await expect(makeAdapter().connect()).resolves.toBeUndefined();
  });

  it('throws when the gateway is not reachable', async () => {
    (fetch as Mock).mockRejectedValueOnce(new Error('network failure'));
    await expect(makeAdapter().connect()).rejects.toThrow('OpenClawAdapter: cannot reach gateway');
  });

  it('throws an error that includes the gatewayUrl', async () => {
    (fetch as Mock).mockRejectedValueOnce(new Error('network failure'));
    const adapter = makeAdapter({ gatewayUrl: 'http://custom-host:9999' });
    await expect(adapter.connect()).rejects.toThrow('http://custom-host:9999');
  });

  it('throws when botToken is present and validation returns 401', async () => {
    (fetch as Mock)
      .mockResolvedValueOnce(makeOkResponse({ status: 'ok' })) // detect → /health
      .mockResolvedValueOnce(makeErrorResponse(401)); // validateToken → 401
    await expect(makeAdapter().connect()).rejects.toThrow(
      'OpenClawAdapter: authentication failed — check botToken',
    );
  });

  it('throws when botToken is present and validation returns 403', async () => {
    (fetch as Mock)
      .mockResolvedValueOnce(makeOkResponse({ status: 'ok' })) // detect → /health
      .mockResolvedValueOnce(makeErrorResponse(403)); // validateToken → 403
    await expect(makeAdapter().connect()).rejects.toThrow(
      'OpenClawAdapter: authentication failed — check botToken',
    );
  });

  it('skips token validation when botToken is an empty string', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse({ status: 'ok' }));
    const adapter = makeAdapter({ botToken: '' });
    await expect(adapter.connect()).resolves.toBeUndefined();
    // Only /health should have been called (no validateToken call)
    expect((fetch as Mock).mock.calls.length).toBe(1);
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
    // First connect
    (fetch as Mock)
      .mockResolvedValueOnce(makeOkResponse({ status: 'ok' }))
      .mockResolvedValueOnce(makeOkResponse({}, 200));
    const adapter = makeAdapter();
    await adapter.connect();

    await adapter.disconnect();

    // Second connect
    (fetch as Mock)
      .mockResolvedValueOnce(makeOkResponse({ status: 'ok' }))
      .mockResolvedValueOnce(makeOkResponse({}, 200));
    await expect(adapter.connect()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// chat() — guard: not connected
// ---------------------------------------------------------------------------

describe('chat() — not connected guard', () => {
  it('throws when called before connect()', async () => {
    const adapter = makeAdapter();
    await expect(
      adapter.chat([{ role: 'user', content: 'hello' }]),
    ).rejects.toThrow('OpenClawAdapter: not connected — call connect() first');
  });

  it('throws after disconnect()', async () => {
    const adapter = await makeConnectedAdapter();
    await adapter.disconnect();
    await expect(
      adapter.chat([{ role: 'user', content: 'hello' }]),
    ).rejects.toThrow('OpenClawAdapter: not connected');
  });
});

// ---------------------------------------------------------------------------
// chat() — happy path
// ---------------------------------------------------------------------------

describe('chat() — happy path', () => {
  it('returns content from the first choice', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeOpenAISuccess('Hi from OpenClaw!')));
    const result = await adapter.chat([{ role: 'user', content: 'Hello' }]);
    expect(result.content).toBe('Hi from OpenClaw!');
  });

  it('maps finish_reason "stop" to finishReason "stop"', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeOpenAISuccess('ok', 'stop')));
    const result = await adapter.chat([{ role: 'user', content: 'hi' }]);
    expect(result.finishReason).toBe('stop');
  });

  it('maps finish_reason "length" to finishReason "length"', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeOpenAISuccess('...', 'length')));
    const result = await adapter.chat([{ role: 'user', content: 'hi' }]);
    expect(result.finishReason).toBe('length');
  });

  it('maps unknown finish_reason to finishReason "error"', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeOpenAISuccess('x', 'content_filter')));
    const result = await adapter.chat([{ role: 'user', content: 'hi' }]);
    expect(result.finishReason).toBe('error');
  });

  it('maps null finish_reason to finishReason "error"', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeOpenAISuccess('x', null as unknown as string)));
    const result = await adapter.chat([{ role: 'user', content: 'hi' }]);
    expect(result.finishReason).toBe('error');
  });

  it('includes parsed usage when present in the response', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(
      makeOkResponse(
        makeOpenAISuccess('hi', 'stop', { prompt_tokens: 8, completion_tokens: 3, total_tokens: 11 }),
      ),
    );
    const result = await adapter.chat([{ role: 'user', content: 'hi' }]);
    expect(result.usage).toEqual({ promptTokens: 8, completionTokens: 3, totalTokens: 11 });
  });

  it('returns undefined usage when usage is absent from the response', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(
      makeOkResponse({
        choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
      }),
    );
    const result = await adapter.chat([{ role: 'user', content: 'hi' }]);
    expect(result.usage).toBeUndefined();
  });

  it('sends POST to <gatewayUrl>/v1/chat/completions', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeOpenAISuccess()));
    await adapter.chat([{ role: 'user', content: 'hi' }]);
    const [url, init] = (fetch as Mock).mock.calls[2] as [string, RequestInit];
    expect(url).toBe(`${GATEWAY_URL}/v1/chat/completions`);
    expect(init.method).toBe('POST');
  });

  it('sends messages and stream:false in the request body', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeOpenAISuccess()));
    const messages = [
      { role: 'system' as const, content: 'You are a helpful bot.' },
      { role: 'user' as const, content: 'Hello' },
    ];
    await adapter.chat(messages);
    const [, init] = (fetch as Mock).mock.calls[2] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.stream).toBe(false);
    expect(body.messages).toEqual([
      { role: 'system', content: 'You are a helpful bot.' },
      { role: 'user', content: 'Hello' },
    ]);
  });

  it('includes agent_id in the request body when agentId is configured', async () => {
    const adapter = await makeConnectedAdapter({ agentId: 'bot-xyz' });
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeOpenAISuccess()));
    await adapter.chat([{ role: 'user', content: 'hi' }]);
    const [, init] = (fetch as Mock).mock.calls[2] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.agent_id).toBe('bot-xyz');
  });

  it('omits agent_id from the request body when agentId is not configured', async () => {
    const adapter = await makeConnectedAdapter({ agentId: undefined });
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeOpenAISuccess()));
    await adapter.chat([{ role: 'user', content: 'hi' }]);
    const [, init] = (fetch as Mock).mock.calls[2] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.agent_id).toBeUndefined();
  });

  it('forwards temperature and maxTokens options to the request body', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeOpenAISuccess()));
    await adapter.chat([{ role: 'user', content: 'hi' }], { temperature: 0.8, maxTokens: 512 });
    const [, init] = (fetch as Mock).mock.calls[2] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.temperature).toBe(0.8);
    expect(body.max_tokens).toBe(512);
  });
});

// ---------------------------------------------------------------------------
// chat() — error responses (non-200 status)
// ---------------------------------------------------------------------------

describe('chat() — error responses', () => {
  it('throws on HTTP 400 with a message from the OpenAI error body', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(
      makeErrorResponse(400, { error: { message: 'Bad request payload' } }),
    );
    await expect(adapter.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      'OpenClawAdapter: Bad request payload',
    );
  });

  it('throws on HTTP 401 with a message from the OpenAI error body', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(
      makeErrorResponse(401, { error: { message: 'Unauthorized' } }),
    );
    await expect(adapter.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      'OpenClawAdapter: Unauthorized',
    );
  });

  it('throws on HTTP 500 falling back to "HTTP 500" when no error body', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(makeErrorResponse(500, {}));
    await expect(adapter.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      'OpenClawAdapter: HTTP 500',
    );
  });

  it('throws on HTTP 503 falling back to "HTTP 503" when error body is null', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(makeErrorResponse(503, null));
    await expect(adapter.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      'OpenClawAdapter: HTTP 503',
    );
  });

  it('throws when response body is not OpenAI-compatible format', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse({ result: 'something unexpected' }));
    await expect(adapter.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      'OpenClawAdapter: unexpected response format from gateway',
    );
  });

  it('throws when choices array is empty', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse({ choices: [] }));
    await expect(adapter.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      'OpenClawAdapter: response contained no choices',
    );
  });
});

// ---------------------------------------------------------------------------
// chat() — timeout handling
// ---------------------------------------------------------------------------

describe('chat() — timeout', () => {
  it('throws a timeout error when fetch aborts', async () => {
    const adapter = await makeConnectedAdapter({ timeout: 100 });
    const abortError = new Error('The operation was aborted.');
    abortError.name = 'AbortError';
    (fetch as Mock).mockRejectedValueOnce(abortError);
    await expect(adapter.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      'OpenClawAdapter: request timed out after 100ms',
    );
  });

  it('includes the effective timeout duration in the timeout error message', async () => {
    const adapter = await makeConnectedAdapter({ timeout: 3_000 });
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    (fetch as Mock).mockRejectedValueOnce(abortError);
    await expect(adapter.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      '3000ms',
    );
  });

  it('uses per-call timeout from ChatOptions over the config timeout', async () => {
    const adapter = await makeConnectedAdapter({ timeout: 30_000 });
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    (fetch as Mock).mockRejectedValueOnce(abortError);
    await expect(
      adapter.chat([{ role: 'user', content: 'hi' }], { timeout: 250 }),
    ).rejects.toThrow('250ms');
  });

  it('wraps unexpected fetch errors in an OpenClawAdapter error', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(adapter.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      'OpenClawAdapter: unexpected error — Failed to fetch',
    );
  });
});

// ---------------------------------------------------------------------------
// Headers — Authorization and content-type
// ---------------------------------------------------------------------------

describe('Headers', () => {
  it('includes Authorization: Bearer <botToken> in chat requests', async () => {
    const adapter = await makeConnectedAdapter({ botToken: 'my-secret-token' });
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeOpenAISuccess()));
    await adapter.chat([{ role: 'user', content: 'hi' }]);
    const [, init] = (fetch as Mock).mock.calls[2] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer my-secret-token');
  });

  it('includes Authorization: Bearer <botToken> in detect() requests', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse({ status: 'ok' }));
    const adapter = makeAdapter({ botToken: 'health-token' });
    await adapter.detect();
    const [, init] = (fetch as Mock).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer health-token');
  });

  it('omits Authorization header when botToken is not provided', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse({ status: 'ok' }));
    const adapter = makeAdapter({ botToken: undefined });
    await adapter.detect();
    const [, init] = (fetch as Mock).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });

  it('omits Authorization header when botToken is an empty string', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse({ status: 'ok' }));
    const adapter = makeAdapter({ botToken: '' });
    await adapter.detect();
    const [, init] = (fetch as Mock).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });

  it('sets Content-Type: application/json on all requests', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse({ status: 'ok' }));
    await makeAdapter().detect();
    const [, init] = (fetch as Mock).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('sets Accept: application/json on all requests', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse({ status: 'ok' }));
    await makeAdapter().detect();
    const [, init] = (fetch as Mock).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Accept']).toBe('application/json');
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

  it('returns the same capabilities regardless of config values', () => {
    const caps = makeAdapter({ agentId: 'other-agent', botToken: 'tok' }).getCapabilities();
    expect(caps).toEqual({
      streaming: false,
      functionCalling: false,
      vision: false,
      maxContextLength: 8_192,
    });
  });

  it('does not call fetch', () => {
    makeAdapter().getCapabilities();
    expect(fetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Config — gatewayUrl, botToken, agentId, timeout
// ---------------------------------------------------------------------------

describe('Config', () => {
  it('uses the configured gatewayUrl for the /health endpoint', async () => {
    const url = 'http://my-custom-gateway:8080';
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse({ status: 'ok' }));
    await makeAdapter({ gatewayUrl: url }).detect();
    const [calledUrl] = (fetch as Mock).mock.calls[0] as [string];
    expect(calledUrl).toBe(`${url}/health`);
  });

  it('uses the configured gatewayUrl for the /v1/chat/completions endpoint', async () => {
    const url = 'http://my-custom-gateway:8080';
    const adapter = await makeConnectedAdapter({ gatewayUrl: url });
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeOpenAISuccess()));
    await adapter.chat([{ role: 'user', content: 'hi' }]);
    // calls[2] because connect() already consumed [0] (/health) and [1] (/v1/auth/validate)
    const [calledUrl] = (fetch as Mock).mock.calls[2] as [string];
    expect(calledUrl).toBe(`${url}/v1/chat/completions`);
  });

  it('includes botToken in the Authorization header', async () => {
    const adapter = await makeConnectedAdapter({ botToken: 'super-secret' });
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeOpenAISuccess()));
    await adapter.chat([{ role: 'user', content: 'hi' }]);
    const [, init] = (fetch as Mock).mock.calls[2] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer super-secret');
  });

  it('includes agentId as agent_id in the chat request body', async () => {
    const adapter = await makeConnectedAdapter({ agentId: 'my-agent-id' });
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeOpenAISuccess()));
    await adapter.chat([{ role: 'user', content: 'hi' }]);
    const [, init] = (fetch as Mock).mock.calls[2] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.agent_id).toBe('my-agent-id');
  });

  it('applies the default 30s timeout when no timeout is provided', async () => {
    // The adapter must construct correctly with no timeout
    const adapter = new OpenClawAdapter({ gatewayUrl: GATEWAY_URL });
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse({ status: 'ok' }));
    // detect() should work normally — just verify it doesn't throw
    await expect(adapter.detect()).resolves.toBe(true);
  });

  it('applies per-call timeout from ChatOptions over the config-level timeout', async () => {
    const adapter = await makeConnectedAdapter({ timeout: 30_000 });
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeOpenAISuccess()));
    const result = await adapter.chat([{ role: 'user', content: 'hi' }], { timeout: 1_000 });
    // The request should succeed; the short timeout doesn't fire because the mock resolves instantly
    expect(result.content).toBe('Hello from OpenClaw!');
  });
});

// ---------------------------------------------------------------------------
// fetchCapabilities() — bonus: future live capabilities endpoint
// ---------------------------------------------------------------------------

describe('fetchCapabilities()', () => {
  it('returns default capabilities when /v1/capabilities responds with a non-200 status', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeErrorResponse(404));
    const caps = await makeAdapter().fetchCapabilities();
    expect(caps).toEqual({
      streaming: false,
      functionCalling: false,
      vision: false,
      maxContextLength: 8_192,
    });
  });

  it('merges live capability values from a 200 response', async () => {
    (fetch as Mock).mockResolvedValueOnce(
      makeOkResponse({
        streaming: true,
        functionCalling: true,
        vision: false,
        maxContextLength: 32_768,
      }),
    );
    const caps = await makeAdapter().fetchCapabilities();
    expect(caps).toEqual({
      streaming: true,
      functionCalling: true,
      vision: false,
      maxContextLength: 32_768,
    });
  });

  it('falls back to defaults when the gateway returns an unparseable body', async () => {
    const response = {
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(new SyntaxError('invalid json')),
      headers: new Headers(),
    } as unknown as Response;
    (fetch as Mock).mockResolvedValueOnce(response);
    const caps = await makeAdapter().fetchCapabilities();
    expect(caps).toEqual({
      streaming: false,
      functionCalling: false,
      vision: false,
      maxContextLength: 8_192,
    });
  });

  it('fills missing fields with defaults when response is a partial capabilities object', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse({ streaming: true }));
    const caps = await makeAdapter().fetchCapabilities();
    expect(caps.streaming).toBe(true);
    expect(caps.functionCalling).toBe(false);
    expect(caps.vision).toBe(false);
    expect(caps.maxContextLength).toBe(8_192);
  });

  it('returns default capabilities when fetch throws a network error', async () => {
    (fetch as Mock).mockRejectedValueOnce(new Error('ECONNRESET'));
    const caps = await makeAdapter().fetchCapabilities();
    expect(caps).toEqual(makeAdapter().getCapabilities());
  });
});
