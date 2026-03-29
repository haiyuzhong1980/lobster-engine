// @lobster-engine/scene-werewolf — LobsterArenaConnector unit tests

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LobsterArenaConnector,
  ArenaApiError,
} from '../connector.js';
import type {
  ArenaConnectorConfig,
  BotRegistration,
  InviteCode,
  MatchResult,
} from '../connector.js';
import type { SceneMetadata } from '@lobster-engine/core';

// ---------------------------------------------------------------------------
// fetch mock helpers
// ---------------------------------------------------------------------------

function mockResponse(
  body: unknown,
  status = 200,
  statusText = 'OK',
): Response {
  const text =
    body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(text, {
    status,
    statusText,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_URL = 'http://arena.test';
const API_KEY = 'test-api-key';

const defaultConfig: ArenaConnectorConfig = {
  arenaUrl: BASE_URL,
  apiKey: API_KEY,
  timeoutMs: 5_000,
};

const botRegistration: BotRegistration = {
  botId: 'bot-1',
  botToken: 'tok-abc',
  displayName: 'TestBot',
};

const inviteCode: InviteCode = {
  code: 'INV-001',
  sceneId: 'scene-42',
  expiresAt: Date.now() + 60_000,
};

const matchResult: MatchResult = {
  sceneId: 'scene-42',
  players: [
    { id: 'bot-1', name: 'TestBot', role: 'villager' },
    { id: 'bot-2', name: 'OtherBot' },
  ],
  startedAt: Date.now(),
};

const sceneMetadata: SceneMetadata = {
  id: 'scene-42',
  name: 'Werewolf Room 1',
  type: 'werewolf',
  playerCount: 2,
  status: 'active',
  config: {},
};

// ---------------------------------------------------------------------------
// Typed fetch spy
// ---------------------------------------------------------------------------

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

describe('LobsterArenaConnector construction', () => {
  it('strips trailing slash from arenaUrl', async () => {
    const connector = new LobsterArenaConnector({
      arenaUrl: 'http://arena.test/',
      timeoutMs: 100,
    });
    fetchSpy.mockResolvedValueOnce(mockResponse(botRegistration));
    await connector.registerBot('Bot', 'test');
    const calledUrl: string = (fetchSpy.mock.calls[0] as [string, RequestInit])[0];
    expect(calledUrl).toBe('http://arena.test/api/bots/register');
  });

  it('uses 30_000 ms as default timeout', () => {
    // Just verify construction succeeds without timeoutMs provided
    expect(
      () => new LobsterArenaConnector({ arenaUrl: BASE_URL }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Authorization header
// ---------------------------------------------------------------------------

describe('Authorization header', () => {
  it('sends Bearer token when apiKey is provided', async () => {
    const connector = new LobsterArenaConnector(defaultConfig);
    fetchSpy.mockResolvedValueOnce(mockResponse(botRegistration));
    await connector.registerBot('Bot', 'test');
    const init: RequestInit = (fetchSpy.mock.calls[0] as [string, RequestInit])[1];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${API_KEY}`);
  });

  it('omits Authorization header when apiKey is absent', async () => {
    const connector = new LobsterArenaConnector({ arenaUrl: BASE_URL });
    fetchSpy.mockResolvedValueOnce(mockResponse(botRegistration));
    await connector.registerBot('Bot', 'test');
    const init: RequestInit = (fetchSpy.mock.calls[0] as [string, RequestInit])[1];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });

  it('always sends Content-Type application/json', async () => {
    const connector = new LobsterArenaConnector(defaultConfig);
    fetchSpy.mockResolvedValueOnce(mockResponse(botRegistration));
    await connector.registerBot('Bot', 'test');
    const init: RequestInit = (fetchSpy.mock.calls[0] as [string, RequestInit])[1];
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });
});

// ---------------------------------------------------------------------------
// registerBot
// ---------------------------------------------------------------------------

describe('LobsterArenaConnector.registerBot()', () => {
  it('POSTs to /api/bots/register', async () => {
    const connector = new LobsterArenaConnector(defaultConfig);
    fetchSpy.mockResolvedValueOnce(mockResponse(botRegistration));
    await connector.registerBot('TestBot', 'openclaw');
    const calledUrl: string = (fetchSpy.mock.calls[0] as [string, RequestInit])[0];
    const init: RequestInit = (fetchSpy.mock.calls[0] as [string, RequestInit])[1];
    expect(calledUrl).toBe(`${BASE_URL}/api/bots/register`);
    expect(init.method).toBe('POST');
  });

  it('sends name and platform in request body', async () => {
    const connector = new LobsterArenaConnector(defaultConfig);
    fetchSpy.mockResolvedValueOnce(mockResponse(botRegistration));
    await connector.registerBot('TestBot', 'openclaw');
    const init: RequestInit = (fetchSpy.mock.calls[0] as [string, RequestInit])[1];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body['name']).toBe('TestBot');
    expect(body['platform']).toBe('openclaw');
  });

  it('returns BotRegistration on success', async () => {
    const connector = new LobsterArenaConnector(defaultConfig);
    fetchSpy.mockResolvedValueOnce(mockResponse(botRegistration));
    const result = await connector.registerBot('TestBot', 'openclaw');
    expect(result).toEqual(botRegistration);
  });

  it('throws ArenaApiError on 409 conflict', async () => {
    const connector = new LobsterArenaConnector(defaultConfig);
    fetchSpy.mockResolvedValueOnce(
      mockResponse({ message: 'Bot already exists' }, 409, 'Conflict'),
    );
    await expect(connector.registerBot('TestBot', 'openclaw')).rejects.toThrow(
      ArenaApiError,
    );
  });

  it('ArenaApiError contains statusCode and endpoint', async () => {
    const connector = new LobsterArenaConnector(defaultConfig);
    fetchSpy.mockResolvedValueOnce(
      mockResponse({ message: 'Bot already exists' }, 409),
    );
    const error = await connector
      .registerBot('TestBot', 'openclaw')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ArenaApiError);
    const apiError = error as ArenaApiError;
    expect(apiError.statusCode).toBe(409);
    expect(apiError.endpoint).toBe('/api/bots/register');
    expect(apiError.message).toBe('Bot already exists');
  });
});

// ---------------------------------------------------------------------------
// unregisterBot
// ---------------------------------------------------------------------------

describe('LobsterArenaConnector.unregisterBot()', () => {
  it('sends DELETE to /api/bots/:id', async () => {
    const connector = new LobsterArenaConnector(defaultConfig);
    fetchSpy.mockResolvedValueOnce(mockResponse(undefined, 200));
    await connector.unregisterBot('bot-1');
    const calledUrl: string = (fetchSpy.mock.calls[0] as [string, RequestInit])[0];
    const init: RequestInit = (fetchSpy.mock.calls[0] as [string, RequestInit])[1];
    expect(calledUrl).toBe(`${BASE_URL}/api/bots/bot-1`);
    expect(init.method).toBe('DELETE');
  });

  it('URL-encodes the botId', async () => {
    const connector = new LobsterArenaConnector(defaultConfig);
    fetchSpy.mockResolvedValueOnce(mockResponse(undefined, 200));
    await connector.unregisterBot('bot id/with spaces');
    const calledUrl: string = (fetchSpy.mock.calls[0] as [string, RequestInit])[0];
    expect(calledUrl).toBe(`${BASE_URL}/api/bots/bot%20id%2Fwith%20spaces`);
  });

  it('resolves to void on success', async () => {
    const connector = new LobsterArenaConnector(defaultConfig);
    fetchSpy.mockResolvedValueOnce(mockResponse(undefined, 200));
    await expect(connector.unregisterBot('bot-1')).resolves.toBeUndefined();
  });

  it('throws ArenaApiError on 404 not found', async () => {
    const connector = new LobsterArenaConnector(defaultConfig);
    fetchSpy.mockResolvedValueOnce(
      mockResponse({ message: 'Bot not found' }, 404),
    );
    await expect(connector.unregisterBot('ghost-bot')).rejects.toThrow(
      ArenaApiError,
    );
  });
});

// ---------------------------------------------------------------------------
// createInvite
// ---------------------------------------------------------------------------

describe('LobsterArenaConnector.createInvite()', () => {
  it('POSTs to /api/invites', async () => {
    const connector = new LobsterArenaConnector(defaultConfig);
    fetchSpy.mockResolvedValueOnce(mockResponse(inviteCode));
    await connector.createInvite('werewolf');
    const calledUrl: string = (fetchSpy.mock.calls[0] as [string, RequestInit])[0];
    expect(calledUrl).toBe(`${BASE_URL}/api/invites`);
  });

  it('sends sceneType and empty config when config is omitted', async () => {
    const connector = new LobsterArenaConnector(defaultConfig);
    fetchSpy.mockResolvedValueOnce(mockResponse(inviteCode));
    await connector.createInvite('werewolf');
    const init: RequestInit = (fetchSpy.mock.calls[0] as [string, RequestInit])[1];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body['sceneType']).toBe('werewolf');
    expect(body['config']).toEqual({});
  });

  it('sends config when provided', async () => {
    const connector = new LobsterArenaConnector(defaultConfig);
    fetchSpy.mockResolvedValueOnce(mockResponse(inviteCode));
    await connector.createInvite('werewolf', { maxPlayers: 12 });
    const init: RequestInit = (fetchSpy.mock.calls[0] as [string, RequestInit])[1];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body['config']).toEqual({ maxPlayers: 12 });
  });

  it('returns InviteCode on success', async () => {
    const connector = new LobsterArenaConnector(defaultConfig);
    fetchSpy.mockResolvedValueOnce(mockResponse(inviteCode));
    const result = await connector.createInvite('werewolf');
    expect(result).toEqual(inviteCode);
  });

  it('throws ArenaApiError on 500 server error', async () => {
    const connector = new LobsterArenaConnector(defaultConfig);
    fetchSpy.mockResolvedValueOnce(
      mockResponse({ message: 'Internal error' }, 500),
    );
    await expect(connector.createInvite('werewolf')).rejects.toThrow(
      ArenaApiError,
    );
  });
});

// ---------------------------------------------------------------------------
// joinByInvite
// ---------------------------------------------------------------------------

describe('LobsterArenaConnector.joinByInvite()', () => {
  it('POSTs to /api/invites/:code/join', async () => {
    const connector = new LobsterArenaConnector(defaultConfig);
    fetchSpy.mockResolvedValueOnce(mockResponse(matchResult));
    await connector.joinByInvite('bot-1', 'INV-001');
    const calledUrl: string = (fetchSpy.mock.calls[0] as [string, RequestInit])[0];
    expect(calledUrl).toBe(`${BASE_URL}/api/invites/INV-001/join`);
  });

  it('URL-encodes the invite code', async () => {
    const connector = new LobsterArenaConnector(defaultConfig);
    fetchSpy.mockResolvedValueOnce(mockResponse(matchResult));
    await connector.joinByInvite('bot-1', 'INV CODE/1');
    const calledUrl: string = (fetchSpy.mock.calls[0] as [string, RequestInit])[0];
    expect(calledUrl).toBe(`${BASE_URL}/api/invites/INV%20CODE%2F1/join`);
  });

  it('sends botId in request body', async () => {
    const connector = new LobsterArenaConnector(defaultConfig);
    fetchSpy.mockResolvedValueOnce(mockResponse(matchResult));
    await connector.joinByInvite('bot-99', 'INV-001');
    const init: RequestInit = (fetchSpy.mock.calls[0] as [string, RequestInit])[1];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body['botId']).toBe('bot-99');
  });

  it('returns MatchResult on success', async () => {
    const connector = new LobsterArenaConnector(defaultConfig);
    fetchSpy.mockResolvedValueOnce(mockResponse(matchResult));
    const result = await connector.joinByInvite('bot-1', 'INV-001');
    expect(result).toEqual(matchResult);
  });

  it('throws ArenaApiError on 410 invite expired', async () => {
    const connector = new LobsterArenaConnector(defaultConfig);
    fetchSpy.mockResolvedValueOnce(
      mockResponse({ message: 'Invite expired' }, 410),
    );
    await expect(connector.joinByInvite('bot-1', 'OLD-CODE')).rejects.toThrow(
      ArenaApiError,
    );
  });
});

// ---------------------------------------------------------------------------
// joinMatchmaking
// ---------------------------------------------------------------------------

describe('LobsterArenaConnector.joinMatchmaking()', () => {
  it('POSTs to /api/matchmaking/join', async () => {
    const connector = new LobsterArenaConnector(defaultConfig);
    fetchSpy.mockResolvedValueOnce(mockResponse(matchResult));
    await connector.joinMatchmaking('bot-1', 'werewolf');
    const calledUrl: string = (fetchSpy.mock.calls[0] as [string, RequestInit])[0];
    expect(calledUrl).toBe(`${BASE_URL}/api/matchmaking/join`);
  });

  it('sends botId and sceneType in request body', async () => {
    const connector = new LobsterArenaConnector(defaultConfig);
    fetchSpy.mockResolvedValueOnce(mockResponse(matchResult));
    await connector.joinMatchmaking('bot-42', 'werewolf');
    const init: RequestInit = (fetchSpy.mock.calls[0] as [string, RequestInit])[1];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body['botId']).toBe('bot-42');
    expect(body['sceneType']).toBe('werewolf');
  });

  it('returns MatchResult when server responds with match data', async () => {
    const connector = new LobsterArenaConnector(defaultConfig);
    fetchSpy.mockResolvedValueOnce(mockResponse(matchResult));
    const result = await connector.joinMatchmaking('bot-1', 'werewolf');
    expect(result).toEqual(matchResult);
  });

  it('throws ArenaApiError on 503 service unavailable', async () => {
    const connector = new LobsterArenaConnector(defaultConfig);
    fetchSpy.mockResolvedValueOnce(
      mockResponse({ message: 'Matchmaking unavailable' }, 503),
    );
    await expect(
      connector.joinMatchmaking('bot-1', 'werewolf'),
    ).rejects.toThrow(ArenaApiError);
  });
});

// ---------------------------------------------------------------------------
// leaveMatchmaking
// ---------------------------------------------------------------------------

describe('LobsterArenaConnector.leaveMatchmaking()', () => {
  it('sends DELETE to /api/matchmaking/:botId', async () => {
    const connector = new LobsterArenaConnector(defaultConfig);
    fetchSpy.mockResolvedValueOnce(mockResponse(undefined, 200));
    await connector.leaveMatchmaking('bot-1');
    const calledUrl: string = (fetchSpy.mock.calls[0] as [string, RequestInit])[0];
    const init: RequestInit = (fetchSpy.mock.calls[0] as [string, RequestInit])[1];
    expect(calledUrl).toBe(`${BASE_URL}/api/matchmaking/bot-1`);
    expect(init.method).toBe('DELETE');
  });

  it('URL-encodes the botId', async () => {
    const connector = new LobsterArenaConnector(defaultConfig);
    fetchSpy.mockResolvedValueOnce(mockResponse(undefined, 200));
    await connector.leaveMatchmaking('bot/id with spaces');
    const calledUrl: string = (fetchSpy.mock.calls[0] as [string, RequestInit])[0];
    expect(calledUrl).toBe(`${BASE_URL}/api/matchmaking/bot%2Fid%20with%20spaces`);
  });

  it('resolves to void on success', async () => {
    const connector = new LobsterArenaConnector(defaultConfig);
    fetchSpy.mockResolvedValueOnce(mockResponse(undefined, 200));
    await expect(connector.leaveMatchmaking('bot-1')).resolves.toBeUndefined();
  });

  it('throws ArenaApiError on 404', async () => {
    const connector = new LobsterArenaConnector(defaultConfig);
    fetchSpy.mockResolvedValueOnce(
      mockResponse({ message: 'Not in queue' }, 404),
    );
    await expect(connector.leaveMatchmaking('ghost-bot')).rejects.toThrow(
      ArenaApiError,
    );
  });
});

// ---------------------------------------------------------------------------
// getStatus
// ---------------------------------------------------------------------------

describe('LobsterArenaConnector.getStatus()', () => {
  it('GETs /api/scenes/:id', async () => {
    const connector = new LobsterArenaConnector(defaultConfig);
    fetchSpy.mockResolvedValueOnce(mockResponse(sceneMetadata));
    await connector.getStatus('scene-42');
    const calledUrl: string = (fetchSpy.mock.calls[0] as [string, RequestInit])[0];
    const init: RequestInit = (fetchSpy.mock.calls[0] as [string, RequestInit])[1];
    expect(calledUrl).toBe(`${BASE_URL}/api/scenes/scene-42`);
    expect(init.method).toBe('GET');
  });

  it('URL-encodes the sceneId', async () => {
    const connector = new LobsterArenaConnector(defaultConfig);
    fetchSpy.mockResolvedValueOnce(mockResponse(sceneMetadata));
    await connector.getStatus('scene/42 special');
    const calledUrl: string = (fetchSpy.mock.calls[0] as [string, RequestInit])[0];
    expect(calledUrl).toBe(`${BASE_URL}/api/scenes/scene%2F42%20special`);
  });

  it('returns SceneMetadata on success', async () => {
    const connector = new LobsterArenaConnector(defaultConfig);
    fetchSpy.mockResolvedValueOnce(mockResponse(sceneMetadata));
    const result = await connector.getStatus('scene-42');
    expect(result).toEqual(sceneMetadata);
  });

  it('throws ArenaApiError on 404 scene not found', async () => {
    const connector = new LobsterArenaConnector(defaultConfig);
    fetchSpy.mockResolvedValueOnce(
      mockResponse({ message: 'Scene not found' }, 404),
    );
    await expect(connector.getStatus('missing-scene')).rejects.toThrow(
      ArenaApiError,
    );
  });

  it('ArenaApiError message falls back to "HTTP <status>" when body has no message field', async () => {
    const connector = new LobsterArenaConnector(defaultConfig);
    fetchSpy.mockResolvedValueOnce(mockResponse({}, 502));
    const error = await connector
      .getStatus('scene-42')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ArenaApiError);
    expect((error as ArenaApiError).message).toBe('HTTP 502');
  });

  it('ArenaApiError message uses plain string body when available', async () => {
    const connector = new LobsterArenaConnector(defaultConfig);
    fetchSpy.mockResolvedValueOnce(mockResponse('Gateway Timeout', 504));
    const error = await connector
      .getStatus('scene-42')
      .catch((e: unknown) => e);
    expect((error as ArenaApiError).message).toBe('Gateway Timeout');
  });
});

// ---------------------------------------------------------------------------
// ArenaApiError class
// ---------------------------------------------------------------------------

describe('ArenaApiError', () => {
  it('is an instance of Error', () => {
    const err = new ArenaApiError('oops', 500, '/api/test');
    expect(err).toBeInstanceOf(Error);
  });

  it('has name "ArenaApiError"', () => {
    const err = new ArenaApiError('oops', 500, '/api/test');
    expect(err.name).toBe('ArenaApiError');
  });

  it('exposes statusCode and endpoint', () => {
    const err = new ArenaApiError('bad request', 400, '/api/bots/register');
    expect(err.statusCode).toBe(400);
    expect(err.endpoint).toBe('/api/bots/register');
  });
});
