// @lobster-engine/gateway — GatewayServer unit tests

import { describe, it, expect, beforeEach } from 'vitest';
import { GatewayServer } from '../server.js';
import type { BotRecord, SceneRecord } from '../server.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeServer(): GatewayServer {
  return new GatewayServer({ port: 3000, host: '0.0.0.0' });
}

async function jsonBody<T>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

interface ApiOk<T> {
  success: true;
  data: T;
  meta?: { total: number; page: number; limit: number };
}

interface ApiFail {
  success: false;
  error: string;
}

/** Register a bot and return the created BotRecord. */
async function registerBot(
  app: GatewayServer,
  payload: Record<string, unknown> = { platform: 'telegram' },
): Promise<BotRecord> {
  const res = await app.honoApp.request('/api/v1/bots/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await jsonBody<ApiOk<BotRecord>>(res);
  return body.data;
}

/** Join a scene and return the SceneRecord. */
async function joinScene(
  app: GatewayServer,
  payload: Record<string, unknown>,
): Promise<SceneRecord> {
  const res = await app.honoApp.request('/api/v1/scenes/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await jsonBody<ApiOk<SceneRecord>>(res);
  return body.data;
}

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------

describe('GET /health', () => {
  let server: GatewayServer;

  beforeEach(() => {
    server = makeServer();
  });

  it('returns 200 status code', async () => {
    const res = await server.honoApp.request('/health');
    expect(res.status).toBe(200);
  });

  it('returns success: true', async () => {
    const res = await server.honoApp.request('/health');
    const body = await jsonBody<ApiOk<{ status: string; timestamp: number }>>(res);
    expect(body.success).toBe(true);
  });

  it('returns status "ok" in the data payload', async () => {
    const res = await server.honoApp.request('/health');
    const body = await jsonBody<ApiOk<{ status: string; timestamp: number }>>(res);
    expect(body.data.status).toBe('ok');
  });

  it('returns a numeric timestamp', async () => {
    const before = Date.now();
    const res = await server.honoApp.request('/health');
    const after = Date.now();
    const body = await jsonBody<ApiOk<{ status: string; timestamp: number }>>(res);
    expect(body.data.timestamp).toBeGreaterThanOrEqual(before);
    expect(body.data.timestamp).toBeLessThanOrEqual(after);
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/bots/register
// ---------------------------------------------------------------------------

describe('POST /api/v1/bots/register', () => {
  let server: GatewayServer;

  beforeEach(() => {
    server = makeServer();
  });

  it('returns 201 when platform is provided', async () => {
    const res = await server.honoApp.request('/api/v1/bots/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: 'telegram' }),
    });
    expect(res.status).toBe(201);
  });

  it('returns the created bot with an auto-generated id', async () => {
    const bot = await registerBot(server);
    expect(typeof bot.id).toBe('string');
    expect(bot.id.length).toBeGreaterThan(0);
  });

  it('stores the provided platform on the created bot', async () => {
    const bot = await registerBot(server, { platform: 'discord' });
    expect(bot.platform).toBe('discord');
  });

  it('assigns status "idle" to a newly created bot', async () => {
    const bot = await registerBot(server);
    expect(bot.status).toBe('idle');
  });

  it('uses the supplied token when provided', async () => {
    const bot = await registerBot(server, { platform: 'telegram', token: 'my-secret-token' });
    expect(bot.token).toBe('my-secret-token');
  });

  it('auto-generates a token when not supplied', async () => {
    const bot = await registerBot(server, { platform: 'telegram' });
    expect(typeof bot.token).toBe('string');
    expect(bot.token.length).toBeGreaterThan(0);
  });

  it('stores provided metadata on the bot', async () => {
    const bot = await registerBot(server, {
      platform: 'slack',
      metadata: { region: 'us-east', tier: 'pro' },
    });
    expect(bot.metadata).toEqual({ region: 'us-east', tier: 'pro' });
  });

  it('uses empty object for metadata when not supplied', async () => {
    const bot = await registerBot(server, { platform: 'telegram' });
    expect(bot.metadata).toEqual({});
  });

  it('returns 400 when platform field is missing', async () => {
    const res = await server.honoApp.request('/api/v1/bots/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'abc' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns error message when platform field is missing', async () => {
    const res = await server.honoApp.request('/api/v1/bots/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const body = await jsonBody<ApiFail>(res);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/platform/i);
  });

  it('returns 400 when body is not valid JSON', async () => {
    const res = await server.honoApp.request('/api/v1/bots/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    expect(res.status).toBe(400);
  });

  it('sets createdAt and updatedAt to the same numeric timestamp on creation', async () => {
    const bot = await registerBot(server);
    expect(typeof bot.createdAt).toBe('number');
    expect(bot.createdAt).toBe(bot.updatedAt);
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/bots/:id
// ---------------------------------------------------------------------------

describe('GET /api/v1/bots/:id', () => {
  let server: GatewayServer;

  beforeEach(() => {
    server = makeServer();
  });

  it('returns 200 and the bot when it exists', async () => {
    const created = await registerBot(server, { platform: 'wechat' });
    const res = await server.honoApp.request(`/api/v1/bots/${created.id}`);
    expect(res.status).toBe(200);
    const body = await jsonBody<ApiOk<BotRecord>>(res);
    expect(body.data.id).toBe(created.id);
    expect(body.data.platform).toBe('wechat');
  });

  it('returns 404 for an unknown bot id', async () => {
    const res = await server.honoApp.request('/api/v1/bots/nonexistent-id');
    expect(res.status).toBe(404);
  });

  it('returns success: false and an error message for a missing bot', async () => {
    const res = await server.honoApp.request('/api/v1/bots/ghost');
    const body = await jsonBody<ApiFail>(res);
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe('string');
    expect(body.error).toContain('ghost');
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/bots — list with pagination
// ---------------------------------------------------------------------------

describe('GET /api/v1/bots', () => {
  let server: GatewayServer;

  beforeEach(() => {
    server = makeServer();
  });

  it('returns an empty array when no bots have been registered', async () => {
    const res = await server.honoApp.request('/api/v1/bots');
    const body = await jsonBody<ApiOk<BotRecord[]>>(res);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('returns all registered bots in the data array', async () => {
    await registerBot(server, { platform: 'a' });
    await registerBot(server, { platform: 'b' });
    const res = await server.honoApp.request('/api/v1/bots');
    const body = await jsonBody<ApiOk<BotRecord[]>>(res);
    expect(body.data.length).toBe(2);
  });

  it('includes meta with correct total count', async () => {
    await registerBot(server);
    await registerBot(server);
    const res = await server.honoApp.request('/api/v1/bots');
    const body = await jsonBody<ApiOk<BotRecord[]>>(res);
    expect(body.meta?.total).toBe(2);
  });

  it('returns meta.page = 1 by default', async () => {
    const res = await server.honoApp.request('/api/v1/bots');
    const body = await jsonBody<ApiOk<BotRecord[]>>(res);
    expect(body.meta?.page).toBe(1);
  });

  it('returns meta.limit = 20 by default', async () => {
    const res = await server.honoApp.request('/api/v1/bots');
    const body = await jsonBody<ApiOk<BotRecord[]>>(res);
    expect(body.meta?.limit).toBe(20);
  });

  it('respects custom page and limit query parameters', async () => {
    for (let i = 0; i < 5; i++) {
      await registerBot(server, { platform: `p${i}` });
    }
    const res = await server.honoApp.request('/api/v1/bots?page=2&limit=2');
    const body = await jsonBody<ApiOk<BotRecord[]>>(res);
    expect(body.data.length).toBe(2);
    expect(body.meta?.page).toBe(2);
    expect(body.meta?.limit).toBe(2);
    expect(body.meta?.total).toBe(5);
  });

  it('returns an empty data array when page exceeds total records', async () => {
    await registerBot(server);
    const res = await server.honoApp.request('/api/v1/bots?page=99&limit=20');
    const body = await jsonBody<ApiOk<BotRecord[]>>(res);
    expect(body.data).toEqual([]);
  });

  it('caps limit at 100', async () => {
    const res = await server.honoApp.request('/api/v1/bots?limit=999');
    const body = await jsonBody<ApiOk<BotRecord[]>>(res);
    expect(body.meta?.limit).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/bots/:id
// ---------------------------------------------------------------------------

describe('PATCH /api/v1/bots/:id', () => {
  let server: GatewayServer;

  beforeEach(() => {
    server = makeServer();
  });

  it('returns 200 after a successful update', async () => {
    const bot = await registerBot(server);
    const res = await server.honoApp.request(`/api/v1/bots/${bot.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    });
    expect(res.status).toBe(200);
  });

  it('updates the bot status', async () => {
    const bot = await registerBot(server);
    const res = await server.honoApp.request(`/api/v1/bots/${bot.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    });
    const body = await jsonBody<ApiOk<BotRecord>>(res);
    expect(body.data.status).toBe('active');
  });

  it('updates the bot platform', async () => {
    const bot = await registerBot(server, { platform: 'telegram' });
    const res = await server.honoApp.request(`/api/v1/bots/${bot.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: 'discord' }),
    });
    const body = await jsonBody<ApiOk<BotRecord>>(res);
    expect(body.data.platform).toBe('discord');
  });

  it('replaces metadata when provided', async () => {
    const bot = await registerBot(server, { platform: 'x', metadata: { old: true } });
    const res = await server.honoApp.request(`/api/v1/bots/${bot.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metadata: { new: 'value' } }),
    });
    const body = await jsonBody<ApiOk<BotRecord>>(res);
    expect(body.data.metadata).toEqual({ new: 'value' });
  });

  it('preserves unchanged fields when only partial update is sent', async () => {
    const bot = await registerBot(server, { platform: 'telegram', token: 'tok' });
    const res = await server.honoApp.request(`/api/v1/bots/${bot.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'error' }),
    });
    const body = await jsonBody<ApiOk<BotRecord>>(res);
    expect(body.data.platform).toBe('telegram');
    // CRIT-02: token is stripped from PATCH responses
    expect('token' in body.data).toBe(false);
  });

  it('ignores invalid status values and keeps the existing status', async () => {
    const bot = await registerBot(server);
    const res = await server.honoApp.request(`/api/v1/bots/${bot.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'INVALID_STATUS' }),
    });
    const body = await jsonBody<ApiOk<BotRecord>>(res);
    expect(body.data.status).toBe('idle');
  });

  it('returns 404 when patching a non-existent bot', async () => {
    const res = await server.honoApp.request('/api/v1/bots/no-such-bot', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 for a malformed JSON body', async () => {
    const bot = await registerBot(server);
    const res = await server.honoApp.request(`/api/v1/bots/${bot.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '!!!bad json',
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/bots/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/v1/bots/:id', () => {
  let server: GatewayServer;

  beforeEach(() => {
    server = makeServer();
  });

  it('returns 200 after deleting an existing bot', async () => {
    const bot = await registerBot(server);
    const res = await server.honoApp.request(`/api/v1/bots/${bot.id}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
  });

  it('returns the deleted bot id in the response', async () => {
    const bot = await registerBot(server);
    const res = await server.honoApp.request(`/api/v1/bots/${bot.id}`, {
      method: 'DELETE',
    });
    const body = await jsonBody<ApiOk<{ deleted: string }>>(res);
    expect(body.data.deleted).toBe(bot.id);
  });

  it('removes the bot so it can no longer be fetched', async () => {
    const bot = await registerBot(server);
    await server.honoApp.request(`/api/v1/bots/${bot.id}`, { method: 'DELETE' });
    const res = await server.honoApp.request(`/api/v1/bots/${bot.id}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 when deleting a bot that does not exist', async () => {
    const res = await server.honoApp.request('/api/v1/bots/ghost-bot', {
      method: 'DELETE',
    });
    expect(res.status).toBe(404);
  });

  it('returns success: false and error message when bot is not found', async () => {
    const res = await server.honoApp.request('/api/v1/bots/ghost-bot', {
      method: 'DELETE',
    });
    const body = await jsonBody<ApiFail>(res);
    expect(body.success).toBe(false);
    expect(body.error).toContain('ghost-bot');
  });

  it('reduces the total count returned by GET /api/v1/bots', async () => {
    await registerBot(server, { platform: 'a' });
    const bot = await registerBot(server, { platform: 'b' });
    await server.honoApp.request(`/api/v1/bots/${bot.id}`, { method: 'DELETE' });
    const res = await server.honoApp.request('/api/v1/bots');
    const body = await jsonBody<ApiOk<BotRecord[]>>(res);
    expect(body.meta?.total).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/scenes/join — create scene
// ---------------------------------------------------------------------------

describe('POST /api/v1/scenes/join', () => {
  let server: GatewayServer;

  beforeEach(() => {
    server = makeServer();
  });

  it('returns 201 when a new scene is created', async () => {
    const bot = await registerBot(server);
    const res = await server.honoApp.request('/api/v1/scenes/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botId: bot.id, sceneType: 'werewolf' }),
    });
    expect(res.status).toBe(201);
  });

  it('stores the sceneType as the scene type', async () => {
    const bot = await registerBot(server);
    const scene = await joinScene(server, { botId: bot.id, sceneType: 'werewolf' });
    expect(scene.type).toBe('werewolf');
  });

  it('sets status to "waiting" on a newly created scene', async () => {
    const bot = await registerBot(server);
    const scene = await joinScene(server, { botId: bot.id, sceneType: 'chess' });
    expect(scene.status).toBe('waiting');
  });

  it('includes the joining bot in botIds', async () => {
    const bot = await registerBot(server);
    const scene = await joinScene(server, { botId: bot.id, sceneType: 'chess' });
    expect(scene.botIds).toContain(bot.id);
  });

  it('sets playerCount to 1 for the first bot joining a new scene', async () => {
    const bot = await registerBot(server);
    const scene = await joinScene(server, { botId: bot.id, sceneType: 'chess' });
    expect(scene.playerCount).toBe(1);
  });

  it('uses provided sceneName as the scene name', async () => {
    const bot = await registerBot(server);
    const scene = await joinScene(server, {
      botId: bot.id,
      sceneType: 'poker',
      sceneName: 'High Stakes Table',
    });
    expect(scene.name).toBe('High Stakes Table');
  });

  it('defaults scene name to sceneType when sceneName is not provided', async () => {
    const bot = await registerBot(server);
    const scene = await joinScene(server, { botId: bot.id, sceneType: 'trivia' });
    expect(scene.name).toBe('trivia');
  });

  it('uses provided sceneId as the scene identifier', async () => {
    const bot = await registerBot(server);
    const scene = await joinScene(server, {
      botId: bot.id,
      sceneType: 'poker',
      sceneId: 'poker:room-42',
    });
    expect(scene.id).toBe('poker:room-42');
  });

  it('stores provided config on the scene', async () => {
    const bot = await registerBot(server);
    const scene = await joinScene(server, {
      botId: bot.id,
      sceneType: 'quiz',
      config: { difficulty: 'hard', timeLimit: 30 },
    });
    expect(scene.config).toEqual({ difficulty: 'hard', timeLimit: 30 });
  });

  it('returns 200 (not 201) when the bot joins an existing scene', async () => {
    const bot1 = await registerBot(server, { platform: 'a' });
    const bot2 = await registerBot(server, { platform: 'b' });
    const first = await joinScene(server, {
      botId: bot1.id,
      sceneType: 'chess',
      sceneId: 'chess:shared',
    });
    expect(first).toBeDefined();

    const res = await server.honoApp.request('/api/v1/scenes/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botId: bot2.id, sceneType: 'chess', sceneId: 'chess:shared' }),
    });
    expect(res.status).toBe(200);
  });

  it('increments playerCount when a second bot joins an existing scene', async () => {
    const bot1 = await registerBot(server, { platform: 'a' });
    const bot2 = await registerBot(server, { platform: 'b' });
    await joinScene(server, { botId: bot1.id, sceneType: 'chess', sceneId: 'chess:shared' });
    const updated = await joinScene(server, {
      botId: bot2.id,
      sceneType: 'chess',
      sceneId: 'chess:shared',
    });
    expect(updated.playerCount).toBe(2);
    expect(updated.botIds).toContain(bot1.id);
    expect(updated.botIds).toContain(bot2.id);
  });

  it('does not duplicate the bot when the same bot joins the same scene twice', async () => {
    const bot = await registerBot(server);
    const sceneId = 'test:dedup';
    await joinScene(server, { botId: bot.id, sceneType: 'quiz', sceneId });
    const second = await joinScene(server, { botId: bot.id, sceneType: 'quiz', sceneId });
    expect(second.botIds.filter((id) => id === bot.id).length).toBe(1);
    expect(second.playerCount).toBe(1);
  });

  it('returns 400 when botId is missing', async () => {
    const res = await server.honoApp.request('/api/v1/scenes/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sceneType: 'chess' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when sceneType is missing', async () => {
    const bot = await registerBot(server);
    const res = await server.honoApp.request('/api/v1/scenes/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botId: bot.id }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 when botId refers to a non-existent bot', async () => {
    const res = await server.honoApp.request('/api/v1/scenes/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botId: 'ghost-bot', sceneType: 'chess' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 for malformed JSON body', async () => {
    const res = await server.honoApp.request('/api/v1/scenes/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad',
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/scenes/leave
// ---------------------------------------------------------------------------

describe('POST /api/v1/scenes/leave', () => {
  let server: GatewayServer;

  beforeEach(() => {
    server = makeServer();
  });

  it('returns 200 when a bot leaves a scene', async () => {
    const bot = await registerBot(server);
    const scene = await joinScene(server, { botId: bot.id, sceneType: 'chess' });
    const res = await server.honoApp.request('/api/v1/scenes/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botId: bot.id, sceneId: scene.id }),
    });
    expect(res.status).toBe(200);
  });

  it('removes the bot from botIds after leaving', async () => {
    const bot = await registerBot(server);
    const scene = await joinScene(server, { botId: bot.id, sceneType: 'chess' });
    const res = await server.honoApp.request('/api/v1/scenes/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botId: bot.id, sceneId: scene.id }),
    });
    const body = await jsonBody<ApiOk<SceneRecord>>(res);
    expect(body.data.botIds).not.toContain(bot.id);
  });

  it('decrements playerCount when a bot leaves', async () => {
    const bot1 = await registerBot(server, { platform: 'a' });
    const bot2 = await registerBot(server, { platform: 'b' });
    await joinScene(server, { botId: bot1.id, sceneType: 'chess', sceneId: 'chess:leave-test' });
    await joinScene(server, { botId: bot2.id, sceneType: 'chess', sceneId: 'chess:leave-test' });

    const res = await server.honoApp.request('/api/v1/scenes/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botId: bot1.id, sceneId: 'chess:leave-test' }),
    });
    const body = await jsonBody<ApiOk<SceneRecord>>(res);
    expect(body.data.playerCount).toBe(1);
  });

  it('sets scene status to "ended" when the last bot leaves', async () => {
    const bot = await registerBot(server);
    const scene = await joinScene(server, { botId: bot.id, sceneType: 'solo' });

    const res = await server.honoApp.request('/api/v1/scenes/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botId: bot.id, sceneId: scene.id }),
    });
    const body = await jsonBody<ApiOk<SceneRecord>>(res);
    expect(body.data.status).toBe('ended');
  });

  it('returns 400 when botId is missing', async () => {
    const bot = await registerBot(server);
    const scene = await joinScene(server, { botId: bot.id, sceneType: 'chess' });
    const res = await server.honoApp.request('/api/v1/scenes/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sceneId: scene.id }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when sceneId is missing', async () => {
    const bot = await registerBot(server);
    const res = await server.honoApp.request('/api/v1/scenes/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botId: bot.id }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 when the scene does not exist', async () => {
    const bot = await registerBot(server);
    const res = await server.honoApp.request('/api/v1/scenes/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botId: bot.id, sceneId: 'no-such-scene' }),
    });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/scenes/:id
// ---------------------------------------------------------------------------

describe('GET /api/v1/scenes/:id', () => {
  let server: GatewayServer;

  beforeEach(() => {
    server = makeServer();
  });

  it('returns 200 and the scene when it exists', async () => {
    const bot = await registerBot(server);
    const scene = await joinScene(server, {
      botId: bot.id,
      sceneType: 'trivia',
      sceneId: 'trivia:abc',
    });
    const res = await server.honoApp.request(`/api/v1/scenes/${scene.id}`);
    expect(res.status).toBe(200);
    const body = await jsonBody<ApiOk<SceneRecord>>(res);
    expect(body.data.id).toBe('trivia:abc');
  });

  it('returns 404 for an unknown scene id', async () => {
    const res = await server.honoApp.request('/api/v1/scenes/no-scene');
    expect(res.status).toBe(404);
  });

  it('returns success: false and error message for missing scene', async () => {
    const res = await server.honoApp.request('/api/v1/scenes/ghost-scene');
    const body = await jsonBody<ApiFail>(res);
    expect(body.success).toBe(false);
    expect(body.error).toContain('ghost-scene');
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/scenes — list with pagination
// ---------------------------------------------------------------------------

describe('GET /api/v1/scenes', () => {
  let server: GatewayServer;

  beforeEach(() => {
    server = makeServer();
  });

  it('returns an empty array when no scenes exist', async () => {
    const res = await server.honoApp.request('/api/v1/scenes');
    const body = await jsonBody<ApiOk<SceneRecord[]>>(res);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('returns all scenes in the data array', async () => {
    const bot = await registerBot(server);
    await joinScene(server, { botId: bot.id, sceneType: 'chess', sceneId: 'chess:1' });
    await joinScene(server, { botId: bot.id, sceneType: 'chess', sceneId: 'chess:2' });
    const res = await server.honoApp.request('/api/v1/scenes');
    const body = await jsonBody<ApiOk<SceneRecord[]>>(res);
    expect(body.data.length).toBe(2);
  });

  it('returns meta with correct total count', async () => {
    const bot = await registerBot(server);
    await joinScene(server, { botId: bot.id, sceneType: 'x', sceneId: 'x:1' });
    const res = await server.honoApp.request('/api/v1/scenes');
    const body = await jsonBody<ApiOk<SceneRecord[]>>(res);
    expect(body.meta?.total).toBe(1);
  });

  it('returns meta.page = 1 and meta.limit = 20 by default', async () => {
    const res = await server.honoApp.request('/api/v1/scenes');
    const body = await jsonBody<ApiOk<SceneRecord[]>>(res);
    expect(body.meta?.page).toBe(1);
    expect(body.meta?.limit).toBe(20);
  });

  it('respects custom page and limit query parameters', async () => {
    const bot = await registerBot(server);
    for (let i = 0; i < 5; i++) {
      await joinScene(server, { botId: bot.id, sceneType: 'q', sceneId: `q:${i}` });
    }
    const res = await server.honoApp.request('/api/v1/scenes?page=2&limit=2');
    const body = await jsonBody<ApiOk<SceneRecord[]>>(res);
    expect(body.data.length).toBe(2);
    expect(body.meta?.page).toBe(2);
    expect(body.meta?.limit).toBe(2);
    expect(body.meta?.total).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/scenes/:id/action
// ---------------------------------------------------------------------------

describe('POST /api/v1/scenes/:id/action', () => {
  let server: GatewayServer;

  beforeEach(() => {
    server = makeServer();
  });

  it('returns 200 for a valid action from a scene member', async () => {
    const bot = await registerBot(server);
    const scene = await joinScene(server, { botId: bot.id, sceneType: 'chess' });
    const res = await server.honoApp.request(`/api/v1/scenes/${scene.id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botId: bot.id, type: 'move', content: 'e2-e4' }),
    });
    expect(res.status).toBe(200);
  });

  it('returns the action payload echoed back with scene and bot context', async () => {
    const bot = await registerBot(server);
    const scene = await joinScene(server, { botId: bot.id, sceneType: 'chess' });
    const res = await server.honoApp.request(`/api/v1/scenes/${scene.id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botId: bot.id, type: 'chat', content: 'Hello world' }),
    });
    const body = await jsonBody<ApiOk<{ sceneId: string; botId: string; type: string; content: string }>>(res);
    expect(body.data.sceneId).toBe(scene.id);
    expect(body.data.botId).toBe(bot.id);
    expect(body.data.type).toBe('chat');
    expect(body.data.content).toBe('Hello world');
  });

  it('returns 403 when the bot is not a member of the scene', async () => {
    const member = await registerBot(server, { platform: 'a' });
    const outsider = await registerBot(server, { platform: 'b' });
    const scene = await joinScene(server, { botId: member.id, sceneType: 'chess' });

    const res = await server.honoApp.request(`/api/v1/scenes/${scene.id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botId: outsider.id, type: 'move' }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 404 when the scene does not exist', async () => {
    const bot = await registerBot(server);
    const res = await server.honoApp.request('/api/v1/scenes/nonexistent/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botId: bot.id, type: 'move' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 when botId is missing from the action', async () => {
    const bot = await registerBot(server);
    const scene = await joinScene(server, { botId: bot.id, sceneType: 'chess' });
    const res = await server.honoApp.request(`/api/v1/scenes/${scene.id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'move' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when type is missing from the action', async () => {
    const bot = await registerBot(server);
    const scene = await joinScene(server, { botId: bot.id, sceneType: 'chess' });
    const res = await server.honoApp.request(`/api/v1/scenes/${scene.id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botId: bot.id }),
    });
    expect(res.status).toBe(400);
  });

  it('includes a numeric timestamp in the action response', async () => {
    const bot = await registerBot(server);
    const scene = await joinScene(server, { botId: bot.id, sceneType: 'chess' });
    const before = Date.now();
    const res = await server.honoApp.request(`/api/v1/scenes/${scene.id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botId: bot.id, type: 'ping' }),
    });
    const after = Date.now();
    const body = await jsonBody<ApiOk<{ timestamp: number }>>(res);
    expect(body.data.timestamp).toBeGreaterThanOrEqual(before);
    expect(body.data.timestamp).toBeLessThanOrEqual(after);
  });

  it('forwards optional target field in the action response', async () => {
    const bot = await registerBot(server);
    const scene = await joinScene(server, { botId: bot.id, sceneType: 'chess' });
    const res = await server.honoApp.request(`/api/v1/scenes/${scene.id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botId: bot.id, type: 'attack', target: 'player-7' }),
    });
    const body = await jsonBody<ApiOk<{ target?: string }>>(res);
    expect(body.data.target).toBe('player-7');
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/status
// ---------------------------------------------------------------------------

describe('GET /api/v1/status', () => {
  let server: GatewayServer;

  beforeEach(() => {
    server = makeServer();
  });

  it('returns 200 with success: true', async () => {
    const res = await server.honoApp.request('/api/v1/status');
    expect(res.status).toBe(200);
    const body = await jsonBody<ApiOk<unknown>>(res);
    expect(body.success).toBe(true);
  });

  it('returns botsCount reflecting the number of registered bots', async () => {
    await registerBot(server, { platform: 'a' });
    await registerBot(server, { platform: 'b' });
    const res = await server.honoApp.request('/api/v1/status');
    const body = await jsonBody<ApiOk<{ botsCount: number; scenesCount: number; uptime: number }>>(res);
    expect(body.data.botsCount).toBe(2);
  });

  it('returns scenesCount reflecting the number of active scenes', async () => {
    const bot = await registerBot(server);
    await joinScene(server, { botId: bot.id, sceneType: 'chess', sceneId: 'chess:stat' });
    const res = await server.honoApp.request('/api/v1/status');
    const body = await jsonBody<ApiOk<{ botsCount: number; scenesCount: number; uptime: number }>>(res);
    expect(body.data.scenesCount).toBe(1);
  });

  it('returns a numeric uptime value', async () => {
    const res = await server.honoApp.request('/api/v1/status');
    const body = await jsonBody<ApiOk<{ botsCount: number; scenesCount: number; uptime: number }>>(res);
    expect(typeof body.data.uptime).toBe('number');
    expect(body.data.uptime).toBeGreaterThanOrEqual(0);
  });

  it('returns 0 for botsCount and scenesCount on a fresh server', async () => {
    const res = await server.honoApp.request('/api/v1/status');
    const body = await jsonBody<ApiOk<{ botsCount: number; scenesCount: number; uptime: number }>>(res);
    expect(body.data.botsCount).toBe(0);
    expect(body.data.scenesCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/metrics
// ---------------------------------------------------------------------------

describe('GET /api/v1/metrics', () => {
  let server: GatewayServer;

  beforeEach(() => {
    server = makeServer();
  });

  it('returns 200 with success: true', async () => {
    const res = await server.honoApp.request('/api/v1/metrics');
    expect(res.status).toBe(200);
    const body = await jsonBody<ApiOk<unknown>>(res);
    expect(body.success).toBe(true);
  });

  it('returns bots.total equal to the number of registered bots', async () => {
    await registerBot(server, { platform: 'a' });
    await registerBot(server, { platform: 'b' });
    await registerBot(server, { platform: 'c' });
    const res = await server.honoApp.request('/api/v1/metrics');
    const body = await jsonBody<ApiOk<{ bots: { total: number; byStatus: Record<string, number> } }>>(res);
    expect(body.data.bots.total).toBe(3);
  });

  it('groups bots by status in bots.byStatus', async () => {
    const bot1 = await registerBot(server, { platform: 'a' });
    const bot2 = await registerBot(server, { platform: 'b' });

    // Update bot1 to active status
    await server.honoApp.request(`/api/v1/bots/${bot1.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    });
    // bot2 stays idle
    void bot2;

    const res = await server.honoApp.request('/api/v1/metrics');
    const body = await jsonBody<ApiOk<{ bots: { total: number; byStatus: Record<string, number> } }>>(res);
    expect(body.data.bots.byStatus['active']).toBe(1);
    expect(body.data.bots.byStatus['idle']).toBe(1);
  });

  it('returns scenes.total equal to the number of created scenes', async () => {
    const bot = await registerBot(server);
    await joinScene(server, { botId: bot.id, sceneType: 'chess', sceneId: 'chess:m1' });
    await joinScene(server, { botId: bot.id, sceneType: 'poker', sceneId: 'poker:m1' });
    const res = await server.honoApp.request('/api/v1/metrics');
    const body = await jsonBody<ApiOk<{ scenes: { total: number; byStatus: Record<string, number> } }>>(res);
    expect(body.data.scenes.total).toBe(2);
  });

  it('groups scenes by status in scenes.byStatus', async () => {
    const bot = await registerBot(server);
    await joinScene(server, { botId: bot.id, sceneType: 'chess', sceneId: 'chess:s1' });

    const res = await server.honoApp.request('/api/v1/metrics');
    const body = await jsonBody<ApiOk<{ scenes: { total: number; byStatus: Record<string, number> } }>>(res);
    expect(body.data.scenes.byStatus['waiting']).toBe(1);
  });

  it('returns a memory usage object with heapUsed', async () => {
    const res = await server.honoApp.request('/api/v1/metrics');
    const body = await jsonBody<ApiOk<{ memory: { heapUsed: number } }>>(res);
    expect(typeof body.data.memory.heapUsed).toBe('number');
    expect(body.data.memory.heapUsed).toBeGreaterThan(0);
  });

  it('returns 0 for bots.total and scenes.total on a fresh server', async () => {
    const res = await server.honoApp.request('/api/v1/metrics');
    const body = await jsonBody<ApiOk<{
      bots: { total: number };
      scenes: { total: number };
    }>>(res);
    expect(body.data.bots.total).toBe(0);
    expect(body.data.scenes.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 404 — unknown routes
// ---------------------------------------------------------------------------

describe('Unknown routes', () => {
  let server: GatewayServer;

  beforeEach(() => {
    server = makeServer();
  });

  it('returns 404 for an unregistered GET route', async () => {
    const res = await server.honoApp.request('/api/v1/not-a-real-endpoint');
    expect(res.status).toBe(404);
  });

  it('returns 404 for an unregistered POST route', async () => {
    const res = await server.honoApp.request('/api/v1/nothing-here', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// createServer factory (index.ts)
// ---------------------------------------------------------------------------

describe('createServer factory', () => {
  it('creates a GatewayServer with default port 3000', async () => {
    const { createServer } = await import('../index.js');
    const server = createServer();
    expect(server.config.port).toBe(3000);
  });

  it('creates a GatewayServer with default host 0.0.0.0', async () => {
    const { createServer } = await import('../index.js');
    const server = createServer();
    expect(server.config.host).toBe('0.0.0.0');
  });

  it('allows overriding port via config', async () => {
    const { createServer } = await import('../index.js');
    const server = createServer({ port: 8080 });
    expect(server.config.port).toBe(8080);
  });

  it('allows overriding host via config', async () => {
    const { createServer } = await import('../index.js');
    const server = createServer({ host: '127.0.0.1' });
    expect(server.config.host).toBe('127.0.0.1');
  });

  it('exposes honoApp for in-process testing', async () => {
    const { createServer } = await import('../index.js');
    const server = createServer();
    const res = await server.honoApp.request('/health');
    expect(res.status).toBe(200);
  });
});
