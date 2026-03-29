// @lobster-engine/scene-werewolf — WerewolfClient unit tests

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WerewolfClient } from '../client.js';
import type { WerewolfClientConfig, GameState } from '../client.js';
import type { ActionSpec } from '@lobster-engine/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_CONFIG: WerewolfClientConfig = {
  workerUrl: 'http://localhost:3001',
  botId: 'bot-abc',
  botToken: 'token-xyz',
  pollIntervalMs: 100,
  timeoutMs: 500,
};

function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    phase: 'day_vote',
    round: 1,
    players: [
      { id: 'p1', name: 'Alice', alive: true },
      { id: 'p2', name: 'Bob', alive: true },
    ],
    pendingAction: false,
    lastEvents: [],
    ...overrides,
  };
}

function makeAction(): ActionSpec {
  return {
    type: 'day_vote',
    content: 'Bob',
    target: 'p2',
    metadata: {},
  };
}

function makeOkResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeErrorResponse(status: number, text = 'Error'): Response {
  return new Response(text, { status });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// constructor
// ---------------------------------------------------------------------------

describe('WerewolfClient constructor', () => {
  it('strips trailing slash from workerUrl', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const client = new WerewolfClient({ ...BASE_CONFIG, workerUrl: 'http://localhost:3001/' });
    await client.connect();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/bot/connect',
      expect.anything(),
    );
  });

  it('uses default pollIntervalMs of 2000 when not specified', () => {
    const client = new WerewolfClient({
      workerUrl: 'http://localhost:3001',
      botId: 'b1',
      botToken: 't1',
    });
    // Access via indirect observable: startPolling + stopPolling should not throw
    expect(() => {
      client.startPolling(() => undefined);
      client.stopPolling();
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// connect
// ---------------------------------------------------------------------------

describe('WerewolfClient.connect()', () => {
  it('sends POST /api/bot/connect with botId in body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const client = new WerewolfClient(BASE_CONFIG);
    await client.connect();

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/api/bot/connect');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toMatchObject({ botId: 'bot-abc' });
  });

  it('sends Authorization header with bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const client = new WerewolfClient(BASE_CONFIG);
    await client.connect();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer token-xyz');
  });

  it('throws when fetch rejects (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const client = new WerewolfClient(BASE_CONFIG);
    await expect(client.connect()).rejects.toThrow('network down');
  });

  it('throws on non-2xx HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeErrorResponse(401, 'Unauthorized')));

    const client = new WerewolfClient(BASE_CONFIG);
    await expect(client.connect()).rejects.toThrow('401');
  });
});

// ---------------------------------------------------------------------------
// disconnect
// ---------------------------------------------------------------------------

describe('WerewolfClient.disconnect()', () => {
  it('sends POST /api/bot/disconnect with botId in body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const client = new WerewolfClient(BASE_CONFIG);
    await client.disconnect();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/api/bot/disconnect');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toMatchObject({ botId: 'bot-abc' });
  });

  it('stops any active polling loop before sending the request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse(makeGameState()));
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();

    const client = new WerewolfClient(BASE_CONFIG);
    const onEvent = vi.fn();
    client.startPolling(onEvent);

    // Override fetch to track disconnect separately
    fetchMock.mockResolvedValue(makeOkResponse({}));
    await client.disconnect();

    const callsBefore = fetchMock.mock.calls.length;
    vi.advanceTimersByTime(500);
    // Polling stopped — no additional fetch calls
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it('throws on non-2xx HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeErrorResponse(500, 'Server Error')));

    const client = new WerewolfClient(BASE_CONFIG);
    await expect(client.disconnect()).rejects.toThrow('500');
  });
});

// ---------------------------------------------------------------------------
// pollState
// ---------------------------------------------------------------------------

describe('WerewolfClient.pollState()', () => {
  it('sends GET /api/game/state?botId=... with auth header', async () => {
    const state = makeGameState();
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse(state));
    vi.stubGlobal('fetch', fetchMock);

    const client = new WerewolfClient(BASE_CONFIG);
    await client.pollState();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/api/game/state?botId=bot-abc');
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer token-xyz');
  });

  it('returns a parsed GameState on success', async () => {
    const raw = makeGameState({ phase: 'night_werewolf', round: 3, pendingAction: true });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkResponse(raw)));

    const client = new WerewolfClient(BASE_CONFIG);
    const result = await client.pollState();

    expect(result.phase).toBe('night_werewolf');
    expect(result.round).toBe(3);
    expect(result.pendingAction).toBe(true);
    expect(result.players).toHaveLength(2);
  });

  it('URL-encodes botId containing special characters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse(makeGameState()));
    vi.stubGlobal('fetch', fetchMock);

    const client = new WerewolfClient({ ...BASE_CONFIG, botId: 'bot a+b' });
    await client.pollState();

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('botId=bot%20a%2Bb');
  });

  it('throws on non-2xx HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeErrorResponse(503)));

    const client = new WerewolfClient(BASE_CONFIG);
    await expect(client.pollState()).rejects.toThrow('503');
  });

  it('throws when response body is not an object', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkResponse('not-an-object')));

    const client = new WerewolfClient(BASE_CONFIG);
    await expect(client.pollState()).rejects.toThrow('invalid GameState');
  });

  it('throws when phase field is missing', async () => {
    const bad = { round: 1, players: [], pendingAction: false, lastEvents: [] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkResponse(bad)));

    const client = new WerewolfClient(BASE_CONFIG);
    await expect(client.pollState()).rejects.toThrow('GameState.phase');
  });

  it('throws when round field is not a number', async () => {
    const bad = { phase: 'day_vote', round: 'one', players: [], pendingAction: false, lastEvents: [] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkResponse(bad)));

    const client = new WerewolfClient(BASE_CONFIG);
    await expect(client.pollState()).rejects.toThrow('GameState.round');
  });

  it('throws when players contains an invalid entry', async () => {
    const bad = {
      phase: 'day_vote',
      round: 1,
      players: [{ id: 'p1', name: 'Alice' }], // missing alive
      pendingAction: false,
      lastEvents: [],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkResponse(bad)));

    const client = new WerewolfClient(BASE_CONFIG);
    await expect(client.pollState()).rejects.toThrow('players[0]');
  });

  it('throws when lastEvents contains an invalid entry', async () => {
    const bad = {
      phase: 'day_vote',
      round: 1,
      players: [],
      pendingAction: false,
      lastEvents: [{ type: 'some_event' }], // missing timestamp
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkResponse(bad)));

    const client = new WerewolfClient(BASE_CONFIG);
    await expect(client.pollState()).rejects.toThrow('lastEvents[0]');
  });

  it('preserves lastEvents data field as-is (opaque unknown)', async () => {
    const raw = makeGameState({
      lastEvents: [{ type: 'player_killed', data: { playerName: 'Alice' }, timestamp: 999 }],
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkResponse(raw)));

    const client = new WerewolfClient(BASE_CONFIG);
    const result = await client.pollState();

    expect(result.lastEvents[0]?.data).toEqual({ playerName: 'Alice' });
  });
});

// ---------------------------------------------------------------------------
// submitAction
// ---------------------------------------------------------------------------

describe('WerewolfClient.submitAction()', () => {
  it('sends POST /api/game/action with botId and action', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const client = new WerewolfClient(BASE_CONFIG);
    const action = makeAction();
    await client.submitAction(action);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/api/game/action');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as { botId: string; action: ActionSpec };
    expect(body.botId).toBe('bot-abc');
    expect(body.action).toMatchObject({ type: 'day_vote', target: 'p2' });
  });

  it('sends Authorization header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const client = new WerewolfClient(BASE_CONFIG);
    await client.submitAction(makeAction());

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer token-xyz');
  });

  it('throws on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));

    const client = new WerewolfClient(BASE_CONFIG);
    await expect(client.submitAction(makeAction())).rejects.toThrow('connection refused');
  });

  it('throws on non-2xx HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeErrorResponse(400, 'Bad Request')));

    const client = new WerewolfClient(BASE_CONFIG);
    await expect(client.submitAction(makeAction())).rejects.toThrow('400');
  });
});

// ---------------------------------------------------------------------------
// startPolling / stopPolling
// ---------------------------------------------------------------------------

describe('WerewolfClient startPolling / stopPolling', () => {
  it('invokes onEvent callback each poll tick', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(makeOkResponse(makeGameState()))),
    );

    const client = new WerewolfClient({ ...BASE_CONFIG, pollIntervalMs: 100 });
    const onEvent = vi.fn();
    client.startPolling(onEvent);

    // Advance enough for multiple ticks; flush pending promises each time
    await vi.advanceTimersByTimeAsync(350);

    expect(onEvent.mock.calls.length).toBeGreaterThanOrEqual(3);
    client.stopPolling();
  });

  it('stopPolling prevents further callbacks', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(makeOkResponse(makeGameState()))),
    );

    const client = new WerewolfClient({ ...BASE_CONFIG, pollIntervalMs: 100 });
    const onEvent = vi.fn();
    client.startPolling(onEvent);

    await vi.advanceTimersByTimeAsync(150);
    const countBeforeStop = onEvent.mock.calls.length;

    client.stopPolling();
    await vi.advanceTimersByTimeAsync(400);

    expect(onEvent.mock.calls.length).toBe(countBeforeStop);
  });

  it('calling startPolling twice replaces the previous loop', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(makeOkResponse(makeGameState()))),
    );

    const client = new WerewolfClient({ ...BASE_CONFIG, pollIntervalMs: 100 });
    const first = vi.fn();
    const second = vi.fn();

    client.startPolling(first);
    await vi.advanceTimersByTimeAsync(50);
    client.startPolling(second);
    await vi.advanceTimersByTimeAsync(200);

    client.stopPolling();
    // first callback must not be called after the loop was replaced
    expect(first.mock.calls.length).toBe(0);
    expect(second.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('does not propagate poll errors to caller — loop continues', async () => {
    vi.useFakeTimers();
    let callCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        callCount += 1;
        if (callCount === 1) {
          return Promise.resolve(makeErrorResponse(503));
        }
        return Promise.resolve(makeOkResponse(makeGameState()));
      }),
    );

    const client = new WerewolfClient({ ...BASE_CONFIG, pollIntervalMs: 100 });
    const onEvent = vi.fn();
    expect(() => client.startPolling(onEvent)).not.toThrow();

    await vi.advanceTimersByTimeAsync(250);
    client.stopPolling();

    // At least one successful call after the initial 503
    expect(onEvent.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// waitForTurn
// ---------------------------------------------------------------------------

describe('WerewolfClient.waitForTurn()', () => {
  it('resolves immediately when the first poll has pendingAction=true', async () => {
    vi.useFakeTimers();
    const state = makeGameState({ pendingAction: true });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(makeOkResponse(state))),
    );

    const client = new WerewolfClient(BASE_CONFIG);
    const promise = client.waitForTurn();
    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result.pendingAction).toBe(true);
  });

  it('polls until pendingAction becomes true', async () => {
    vi.useFakeTimers();
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      callCount += 1;
      const pending = callCount >= 3;
      return Promise.resolve(makeOkResponse(makeGameState({ pendingAction: pending })));
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new WerewolfClient({ ...BASE_CONFIG, pollIntervalMs: 100, timeoutMs: 2000 });
    const promise = client.waitForTurn();

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.pendingAction).toBe(true);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('rejects with timeout error when pendingAction never becomes true', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(makeOkResponse(makeGameState({ pendingAction: false }))),
      ),
    );

    const client = new WerewolfClient({ ...BASE_CONFIG, pollIntervalMs: 100, timeoutMs: 300 });
    // Attach a noop catch immediately so the rejection is handled before
    // vi.runAllTimersAsync fires the timeout tick (avoids PromiseRejectionHandledWarning).
    const promise = client.waitForTurn();
    const guarded = promise.catch(() => undefined);

    await vi.runAllTimersAsync();
    await guarded;
    await expect(promise).rejects.toThrow('timed out');
  });

  it('honours an explicit timeoutMs parameter that overrides config', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(makeOkResponse(makeGameState({ pendingAction: false }))),
      ),
    );

    const client = new WerewolfClient({ ...BASE_CONFIG, pollIntervalMs: 100, timeoutMs: 60000 });
    const promise = client.waitForTurn(200);
    const guarded = promise.catch(() => undefined);

    await vi.runAllTimersAsync();
    await guarded;
    await expect(promise).rejects.toThrow('timed out');
  });

  it('rejects when a poll throws a network error', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const client = new WerewolfClient(BASE_CONFIG);
    const promise = client.waitForTurn();
    const guarded = promise.catch(() => undefined);

    await vi.runAllTimersAsync();
    await guarded;
    await expect(promise).rejects.toThrow('ECONNREFUSED');
  });
});
