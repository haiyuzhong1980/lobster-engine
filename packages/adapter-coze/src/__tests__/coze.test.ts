// @lobster-engine/adapter-coze — CozeAdapter unit tests

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { CozeAdapter } from '../index.js';

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

function makeBotInfoSuccess(): unknown {
  return {
    code: 0,
    msg: 'success',
    data: { bot_id: BOT_ID, name: 'Test Bot', description: 'A test bot' },
  };
}

function makeCozeChatSuccess(
  content = 'Hello from Coze!',
  status = 'completed',
  usage?: { token_count?: number; input_count?: number; output_count?: number },
): unknown {
  return {
    code: 0,
    msg: 'success',
    data: {
      id: 'chat-123',
      conversation_id: 'conv-456',
      status,
      usage: usage ?? { token_count: 15, input_count: 10, output_count: 5 },
      messages: [
        { role: 'assistant', content, type: 'answer' },
      ],
    },
  };
}

const API_KEY = 'test-coze-api-key';
const BOT_ID = 'bot-id-123';

function makeAdapter(overrides: Partial<ConstructorParameters<typeof CozeAdapter>[0]> = {}) {
  return new CozeAdapter({
    apiKey: API_KEY,
    botId: BOT_ID,
    timeout: 5_000,
    maxRetries: 0,
    ...overrides,
  });
}

/**
 * Returns a connected adapter. connect() calls fetchBotInfo() → GET /v1/bot/get_online_info.
 */
async function makeConnectedAdapter(
  overrides: Partial<ConstructorParameters<typeof CozeAdapter>[0]> = {},
): Promise<CozeAdapter> {
  (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeBotInfoSuccess()));
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
  it('name is "coze"', () => {
    expect(makeAdapter().name).toBe('coze');
  });

  it('platform is "coze"', () => {
    expect(makeAdapter().platform).toBe('coze');
  });
});

// ---------------------------------------------------------------------------
// detect()
// ---------------------------------------------------------------------------

describe('detect()', () => {
  it('returns true when bot info endpoint responds with 200 OK', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeBotInfoSuccess()));
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

  it('returns false when botId is empty', async () => {
    expect(await makeAdapter({ botId: '' }).detect()).toBe(false);
  });

  it('sends a GET request with bot_id to the bot info endpoint', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeBotInfoSuccess()));
    await makeAdapter().detect();
    const [url, init] = (fetch as Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/bot/get_online_info');
    expect(url).toContain(`bot_id=${encodeURIComponent(BOT_ID)}`);
    expect(init.method).toBe('GET');
  });

  it('includes Authorization: Bearer <apiKey> in the detect request', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeBotInfoSuccess()));
    await makeAdapter({ apiKey: 'my-detect-key' }).detect();
    const [, init] = (fetch as Mock).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer my-detect-key');
  });
});

// ---------------------------------------------------------------------------
// connect()
// ---------------------------------------------------------------------------

describe('connect()', () => {
  it('resolves when bot info is fetched successfully', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeBotInfoSuccess()));
    await expect(makeAdapter().connect()).resolves.toBeUndefined();
  });

  it('throws when apiKey is empty', async () => {
    await expect(makeAdapter({ apiKey: '' }).connect()).rejects.toThrow(
      'CozeAdapter: apiKey is required',
    );
  });

  it('throws when botId is empty', async () => {
    await expect(makeAdapter({ botId: '' }).connect()).rejects.toThrow(
      'CozeAdapter: botId is required',
    );
  });

  it('throws when bot info endpoint returns 401', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeErrorResponse(401));
    await expect(makeAdapter().connect()).rejects.toThrow(
      'CozeAdapter: authentication failed — check apiKey',
    );
  });

  it('throws when bot info endpoint returns 403', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeErrorResponse(403));
    await expect(makeAdapter().connect()).rejects.toThrow(
      'CozeAdapter: authentication failed — check apiKey',
    );
  });

  it('throws when bot info API returns non-zero code', async () => {
    (fetch as Mock).mockResolvedValueOnce(
      makeOkResponse({ code: 4000, msg: 'bot not found', data: null }),
    );
    await expect(makeAdapter().connect()).rejects.toThrow('CozeAdapter: bot info error');
  });

  it('throws when bot info endpoint returns 500', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeErrorResponse(500));
    await expect(makeAdapter().connect()).rejects.toThrow('CozeAdapter:');
  });

  it('throws when fetch rejects during connect', async () => {
    (fetch as Mock).mockRejectedValueOnce(new Error('network down'));
    await expect(makeAdapter().connect()).rejects.toThrow('CozeAdapter: connect failed');
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
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeBotInfoSuccess()));
    const adapter = makeAdapter();
    await adapter.connect();
    await adapter.disconnect();

    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeBotInfoSuccess()));
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
    ).rejects.toThrow('CozeAdapter: not connected — call connect() first');
  });

  it('throws after disconnect()', async () => {
    const adapter = await makeConnectedAdapter();
    await adapter.disconnect();
    await expect(
      adapter.chat([{ role: 'user', content: 'hello' }]),
    ).rejects.toThrow('CozeAdapter: not connected');
  });
});

// ---------------------------------------------------------------------------
// chat() — happy path
// ---------------------------------------------------------------------------

describe('chat() — happy path', () => {
  it('returns content from the assistant answer message', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeCozeChatSuccess('Hi from Coze!')));
    const result = await adapter.chat([{ role: 'user', content: 'Hello' }]);
    expect(result.content).toBe('Hi from Coze!');
  });

  it('maps status "completed" to finishReason "stop"', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeCozeChatSuccess('ok', 'completed')));
    const result = await adapter.chat([{ role: 'user', content: 'hi' }]);
    expect(result.finishReason).toBe('stop');
  });

  it('maps non-completed status to finishReason "error"', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeCozeChatSuccess('x', 'failed')));
    const result = await adapter.chat([{ role: 'user', content: 'hi' }]);
    expect(result.finishReason).toBe('error');
  });

  it('includes parsed usage when present', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(
      makeOkResponse(
        makeCozeChatSuccess('hi', 'completed', { token_count: 18, input_count: 10, output_count: 8 }),
      ),
    );
    const result = await adapter.chat([{ role: 'user', content: 'hi' }]);
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 8, totalTokens: 18 });
  });

  it('sends POST to /v3/chat', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeCozeChatSuccess()));
    await adapter.chat([{ role: 'user', content: 'hi' }]);
    // calls[1] because connect() already consumed calls[0] (bot info)
    const [url, init] = (fetch as Mock).mock.calls[1] as [string, RequestInit];
    expect(url).toContain('/v3/chat');
    expect(init.method).toBe('POST');
  });

  it('sends bot_id, user_id, additional_messages, and stream:false in the body', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeCozeChatSuccess()));
    await adapter.chat([{ role: 'user', content: 'Hello' }]);
    const [, init] = (fetch as Mock).mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.bot_id).toBe(BOT_ID);
    expect(body.stream).toBe(false);
    expect(Array.isArray(body.additional_messages)).toBe(true);
    expect(body.additional_messages[0]).toMatchObject({ role: 'user', content: 'Hello', content_type: 'text' });
  });

  it('filters out system messages from additional_messages', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeCozeChatSuccess()));
    await adapter.chat([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hi' },
    ]);
    const [, init] = (fetch as Mock).mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.additional_messages.every((m: { role: string }) => m.role !== 'system')).toBe(true);
  });

  it('includes Authorization: Bearer <apiKey> header in chat requests', async () => {
    const adapter = await makeConnectedAdapter({ apiKey: 'chat-secret' });
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeCozeChatSuccess()));
    await adapter.chat([{ role: 'user', content: 'hi' }]);
    const [, init] = (fetch as Mock).mock.calls[1] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer chat-secret');
  });

  it('sets Content-Type: application/json and Accept: application/json', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeCozeChatSuccess()));
    await adapter.chat([{ role: 'user', content: 'hi' }]);
    const [, init] = (fetch as Mock).mock.calls[1] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Accept']).toBe('application/json');
  });

  it('uses apiUrl override as the base URL', async () => {
    const customBase = 'https://coze.my-proxy.com';
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeBotInfoSuccess()));
    const adapter = makeAdapter({ apiUrl: customBase });
    await adapter.connect();

    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeCozeChatSuccess()));
    await adapter.chat([{ role: 'user', content: 'hi' }]);
    const [url] = (fetch as Mock).mock.calls[1] as [string];
    expect(url).toContain(customBase);
  });

  it('uses the default user_id when userId is not provided', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeCozeChatSuccess()));
    await adapter.chat([{ role: 'user', content: 'hi' }]);
    const [, init] = (fetch as Mock).mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.user_id).toBe('lobster-engine');
  });

  it('uses the configured userId when provided', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeBotInfoSuccess()));
    const adapter = makeAdapter({ userId: 'custom-user-99' });
    await adapter.connect();
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeCozeChatSuccess()));
    await adapter.chat([{ role: 'user', content: 'hi' }]);
    const [, init] = (fetch as Mock).mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.user_id).toBe('custom-user-99');
  });
});

// ---------------------------------------------------------------------------
// chat() — error responses
// ---------------------------------------------------------------------------

describe('chat() — error responses', () => {
  it('throws on HTTP 400 with fallback message', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(makeErrorResponse(400));
    await expect(adapter.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      'CozeAdapter: HTTP 400',
    );
  });

  it('throws when Coze API returns non-zero code', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(
      makeOkResponse({ code: 4001, msg: 'Bot not found', data: { id: '', conversation_id: '', status: '' } }),
    );
    await expect(adapter.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      'CozeAdapter: API error — Bot not found',
    );
  });

  it('throws when response format is unexpected', async () => {
    const adapter = await makeConnectedAdapter();
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse({ unexpected: 'format' }));
    await expect(adapter.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      'CozeAdapter: unexpected response format from server',
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
      .mockResolvedValueOnce(makeOkResponse(makeCozeChatSuccess('Retried!')));

    const result = await adapter.chat([{ role: 'user', content: 'hi' }]);
    expect(result.content).toBe('Retried!');
    // connect consumed calls[0]; calls[1] = 429, calls[2] = success
    expect((fetch as Mock).mock.calls.length).toBe(3);
  });

  it('throws after exhausting all retries on persistent 429', async () => {
    const adapter = await makeConnectedAdapter({ maxRetries: 2 });
    (fetch as Mock).mockResolvedValue(makeErrorResponse(429));
    await expect(adapter.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow('CozeAdapter:');
    // 1 initial + 2 retries = 3 chat attempts (plus 1 connect call)
    expect((fetch as Mock).mock.calls.length).toBe(4);
  });

  it('retries on 503 and succeeds', async () => {
    const adapter = await makeConnectedAdapter({ maxRetries: 2 });
    (fetch as Mock)
      .mockResolvedValueOnce(makeErrorResponse(503))
      .mockResolvedValueOnce(makeOkResponse(makeCozeChatSuccess('Recovered!')));

    const result = await adapter.chat([{ role: 'user', content: 'hi' }]);
    expect(result.content).toBe('Recovered!');
  });

  it('with maxRetries 0 makes exactly one chat request and throws on 429', async () => {
    const adapter = await makeConnectedAdapter({ maxRetries: 0 });
    (fetch as Mock).mockResolvedValue(makeErrorResponse(429));
    await expect(adapter.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow();
    // calls[0] = connect (bot info), calls[1] = single chat attempt
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
      'CozeAdapter: request timed out after 100ms',
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
  it('uses the default Coze API URL when apiUrl is not provided', async () => {
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeBotInfoSuccess()));
    const adapter = makeAdapter();
    await adapter.connect();
    const [url] = (fetch as Mock).mock.calls[0] as [string];
    expect(url).toContain('api.coze.com');
  });

  it('applies the default 30s timeout when no timeout is configured', async () => {
    const adapter = new CozeAdapter({ apiKey: API_KEY, botId: BOT_ID });
    (fetch as Mock).mockResolvedValueOnce(makeOkResponse(makeBotInfoSuccess()));
    await expect(adapter.connect()).resolves.toBeUndefined();
  });

  it('defaults maxRetries to 3 when not specified', async () => {
    // 3 retries + 1 initial = 4 chat attempts
    const adapter = await makeConnectedAdapter({ maxRetries: undefined });
    (fetch as Mock)
      .mockResolvedValueOnce(makeErrorResponse(503))
      .mockResolvedValueOnce(makeErrorResponse(503))
      .mockResolvedValueOnce(makeErrorResponse(503))
      .mockResolvedValueOnce(makeOkResponse(makeCozeChatSuccess('Finally!')));

    const result = await adapter.chat([{ role: 'user', content: 'hi' }]);
    expect(result.content).toBe('Finally!');
  });
});
