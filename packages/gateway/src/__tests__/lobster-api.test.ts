// @lobster-engine/gateway — Lobster API routes unit tests (A.4 + A.5)

import { describe, it, expect, beforeEach } from 'vitest';
import { GatewayServer } from '../server.js';
import type { LobsterRecord, PersonalityResponse } from '../server.js';
import type { EmotionState, DiaryEntry, LobsterBehavior, IncentiveReward } from '@lobster-engine/core';
import type { WeatherData, LobsterWeatherEffect } from '@lobster-engine/core';

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
}

interface ApiFail {
  success: false;
  error: string;
}

type ApiBody<T> = ApiOk<T> | ApiFail;

/** Register a lobster and return the created LobsterRecord. */
async function registerLobster(
  server: GatewayServer,
  payload: Record<string, unknown> = { name: 'Crabby', ownerId: 'user01' },
): Promise<LobsterRecord> {
  const res = await server.honoApp.request('/api/v1/lobster/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await jsonBody<ApiOk<LobsterRecord>>(res);
  return body.data;
}

// ---------------------------------------------------------------------------
// POST /api/v1/lobster/register
// ---------------------------------------------------------------------------

describe('POST /api/v1/lobster/register', () => {
  let server: GatewayServer;

  beforeEach(() => {
    server = makeServer();
  });

  it('returns 201 with created lobster', async () => {
    const res = await server.honoApp.request('/api/v1/lobster/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Crabby', ownerId: 'user01' }),
    });

    expect(res.status).toBe(201);
    const body = await jsonBody<ApiOk<LobsterRecord>>(res);
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Crabby');
    expect(body.data.ownerId).toBe('user01');
    expect(body.data.level).toBe(1);
  });

  it('generates a unique id', async () => {
    const a = await registerLobster(server);
    const b = await registerLobster(server, { name: 'Lobito', ownerId: 'user02' });
    expect(a.id).not.toBe(b.id);
  });

  it('sets default personality to all-zero DNA', async () => {
    const lobster = await registerLobster(server);
    const dna = lobster.personality;
    expect(dna.introversion_extroversion).toBe(0);
    expect(dna.laziness_curiosity).toBe(0);
    expect(dna.emotional_rational).toBe(0);
    expect(dna.talkative_silent).toBe(0);
    expect(dna.foodie_ascetic).toBe(0);
    expect(dna.nightowl_earlybird).toBe(0);
  });

  it('sets default emotion to all-50 state', async () => {
    const lobster = await registerLobster(server);
    const e = lobster.emotion;
    expect(e.happy).toBe(50);
    expect(e.sleepy).toBe(50);
    expect(e.curious).toBe(50);
    expect(e.hungry).toBe(50);
    expect(e.warm).toBe(50);
    expect(e.proud).toBe(50);
    expect(e.surprised).toBe(50);
    expect(e.zen).toBe(50);
  });

  it('sets currentActivity to idle and currentScene to lobster_home', async () => {
    const lobster = await registerLobster(server);
    expect(lobster.currentActivity).toBe('idle');
    expect(lobster.currentScene).toBe('lobster_home');
  });

  it('initializes stats to zero', async () => {
    const lobster = await registerLobster(server);
    expect(lobster.stats.totalSteps).toBe(0);
    expect(lobster.stats.totalEncounters).toBe(0);
    expect(lobster.lazyCoin).toBe(0);
    expect(lobster.shells).toBe(0);
  });

  it('returns 400 when name is missing', async () => {
    const res = await server.honoApp.request('/api/v1/lobster/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerId: 'user01' }),
    });
    expect(res.status).toBe(400);
    const body = await jsonBody<ApiFail>(res);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/name/i);
  });

  it('returns 400 when ownerId is missing', async () => {
    const res = await server.honoApp.request('/api/v1/lobster/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Crabby' }),
    });
    expect(res.status).toBe(400);
    const body = await jsonBody<ApiFail>(res);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/ownerId/i);
  });

  it('returns 400 for invalid ownerId format', async () => {
    const res = await server.honoApp.request('/api/v1/lobster/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Crabby', ownerId: 'invalid id with spaces' }),
    });
    expect(res.status).toBe(400);
    const body = await jsonBody<ApiFail>(res);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/ownerId/i);
  });

  it('returns 400 for invalid JSON body', async () => {
    const res = await server.honoApp.request('/api/v1/lobster/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/lobster/:id/state
// ---------------------------------------------------------------------------

describe('GET /api/v1/lobster/:id/state', () => {
  let server: GatewayServer;

  beforeEach(() => {
    server = makeServer();
  });

  it('returns full lobster state for an existing lobster', async () => {
    const lobster = await registerLobster(server);
    const res = await server.honoApp.request(`/api/v1/lobster/${lobster.id}/state`);

    expect(res.status).toBe(200);
    const body = await jsonBody<ApiOk<LobsterRecord>>(res);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(lobster.id);
    expect(body.data.name).toBe(lobster.name);
    expect(body.data.ownerId).toBe(lobster.ownerId);
    expect(body.data.level).toBe(1);
    expect(body.data.personality).toBeDefined();
    expect(body.data.emotion).toBeDefined();
    expect(body.data.stats).toBeDefined();
  });

  it('returns 404 for a non-existent lobster', async () => {
    const res = await server.honoApp.request('/api/v1/lobster/does-not-exist/state');
    expect(res.status).toBe(404);
    const body = await jsonBody<ApiFail>(res);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/lobster/activity
// ---------------------------------------------------------------------------

describe('POST /api/v1/lobster/activity', () => {
  let server: GatewayServer;

  beforeEach(() => {
    server = makeServer();
  });

  it('returns behavior for a known activity type', async () => {
    const lobster = await registerLobster(server);

    const res = await server.honoApp.request('/api/v1/lobster/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lobsterId: lobster.id, type: 'walking', confidence: 0.9 }),
    });

    expect(res.status).toBe(200);
    const body = await jsonBody<ApiOk<{ behavior: LobsterBehavior; incentive?: IncentiveReward }>>(res);
    expect(body.success).toBe(true);
    expect(body.data.behavior.scene).toBe('shallow_sea');
    expect(body.data.behavior.action).toBe('beach_walk');
    expect(typeof body.data.behavior.description).toBe('string');
  });

  it('returns behavior for cycling activity', async () => {
    const lobster = await registerLobster(server);
    const res = await server.honoApp.request('/api/v1/lobster/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lobsterId: lobster.id, type: 'cycling', confidence: 0.8 }),
    });
    expect(res.status).toBe(200);
    const body = await jsonBody<ApiOk<{ behavior: LobsterBehavior }>>(res);
    expect(body.data.behavior.scene).toBe('sea_highway');
  });

  it('updates the lobster currentActivity and currentScene', async () => {
    const lobster = await registerLobster(server);
    await server.honoApp.request('/api/v1/lobster/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lobsterId: lobster.id, type: 'sleeping', confidence: 0.95 }),
    });

    const stateRes = await server.honoApp.request(`/api/v1/lobster/${lobster.id}/state`);
    const stateBody = await jsonBody<ApiOk<LobsterRecord>>(stateRes);
    expect(stateBody.data.currentActivity).toBe('sleeping');
    expect(stateBody.data.currentScene).toBe('lobster_bedroom');
  });

  it('accepts activity for a lobster that does not exist yet (no state update)', async () => {
    const res = await server.honoApp.request('/api/v1/lobster/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lobsterId: 'ghost-lobster', type: 'idle', confidence: 0.5 }),
    });
    // lobsterId format is valid, so it should succeed (behavior-only response)
    expect(res.status).toBe(200);
  });

  it('returns 400 when lobsterId is missing', async () => {
    const res = await server.honoApp.request('/api/v1/lobster/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'walking', confidence: 0.9 }),
    });
    expect(res.status).toBe(400);
    const body = await jsonBody<ApiFail>(res);
    expect(body.error).toMatch(/lobsterId/i);
  });

  it('returns 400 when type is missing', async () => {
    const res = await server.honoApp.request('/api/v1/lobster/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lobsterId: 'abc123', confidence: 0.9 }),
    });
    expect(res.status).toBe(400);
    const body = await jsonBody<ApiFail>(res);
    expect(body.error).toMatch(/type/i);
  });

  it('returns 400 for an invalid activity type', async () => {
    const res = await server.honoApp.request('/api/v1/lobster/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lobsterId: 'abc123', type: 'flying_spaghetti', confidence: 0.9 }),
    });
    expect(res.status).toBe(400);
    const body = await jsonBody<ApiFail>(res);
    expect(body.error).toMatch(/type/i);
  });

  it('returns 400 when confidence is missing', async () => {
    const res = await server.honoApp.request('/api/v1/lobster/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lobsterId: 'abc123', type: 'walking' }),
    });
    expect(res.status).toBe(400);
    const body = await jsonBody<ApiFail>(res);
    expect(body.error).toMatch(/confidence/i);
  });

  it('returns 400 when confidence is out of range (> 1)', async () => {
    const res = await server.honoApp.request('/api/v1/lobster/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lobsterId: 'abc123', type: 'walking', confidence: 1.5 }),
    });
    expect(res.status).toBe(400);
    const body = await jsonBody<ApiFail>(res);
    expect(body.error).toMatch(/confidence/i);
  });

  it('returns 400 when confidence is out of range (< 0)', async () => {
    const res = await server.honoApp.request('/api/v1/lobster/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lobsterId: 'abc123', type: 'walking', confidence: -0.1 }),
    });
    expect(res.status).toBe(400);
    const body = await jsonBody<ApiFail>(res);
    expect(body.error).toMatch(/confidence/i);
  });

  it('accepts metadata with speed, steps, altitude', async () => {
    const lobster = await registerLobster(server);
    const res = await server.honoApp.request('/api/v1/lobster/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lobsterId: lobster.id,
        type: 'running',
        confidence: 0.85,
        metadata: { speed: 3.5, steps: 1200, altitude: 45 },
      }),
    });
    expect(res.status).toBe(200);
    const body = await jsonBody<ApiOk<{ behavior: LobsterBehavior }>>(res);
    expect(body.data.behavior.scene).toBe('coral_reef');
  });

  it('returns 400 for invalid lobsterId format', async () => {
    const res = await server.honoApp.request('/api/v1/lobster/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lobsterId: 'bad id!', type: 'walking', confidence: 0.9 }),
    });
    expect(res.status).toBe(400);
    const body = await jsonBody<ApiFail>(res);
    expect(body.error).toMatch(/lobsterId/i);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/lobster/:id/emotion
// ---------------------------------------------------------------------------

describe('PATCH /api/v1/lobster/:id/emotion', () => {
  let server: GatewayServer;

  beforeEach(() => {
    server = makeServer();
  });

  it('applies a known trigger and returns updated emotion', async () => {
    const lobster = await registerLobster(server);

    const res = await server.honoApp.request(`/api/v1/lobster/${lobster.id}/emotion`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger: 'app_open' }),
    });

    expect(res.status).toBe(200);
    const body = await jsonBody<ApiOk<EmotionState>>(res);
    expect(body.success).toBe(true);
    // app_open: happy +8, curious +5, surprised +3 — starting from 50
    expect(body.data.happy).toBe(58);
    expect(body.data.curious).toBe(55);
    expect(body.data.surprised).toBe(53);
  });

  it('applies rain trigger correctly', async () => {
    const lobster = await registerLobster(server);
    const res = await server.honoApp.request(`/api/v1/lobster/${lobster.id}/emotion`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger: 'rain' }),
    });
    expect(res.status).toBe(200);
    const body = await jsonBody<ApiOk<EmotionState>>(res);
    // rain: sleepy +8, zen +6, warm +4
    expect(body.data.sleepy).toBe(58);
    expect(body.data.zen).toBe(56);
    expect(body.data.warm).toBe(54);
  });

  it('persists emotion change into lobster state', async () => {
    const lobster = await registerLobster(server);
    await server.honoApp.request(`/api/v1/lobster/${lobster.id}/emotion`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger: 'long_absence_return' }),
    });

    const stateRes = await server.honoApp.request(`/api/v1/lobster/${lobster.id}/state`);
    const stateBody = await jsonBody<ApiOk<LobsterRecord>>(stateRes);
    // long_absence_return: happy +15
    expect(stateBody.data.emotion.happy).toBe(65);
  });

  it('returns 404 for non-existent lobster', async () => {
    const res = await server.honoApp.request('/api/v1/lobster/no-such-id/emotion', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger: 'app_open' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 when trigger field is missing', async () => {
    const lobster = await registerLobster(server);
    const res = await server.honoApp.request(`/api/v1/lobster/${lobster.id}/emotion`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await jsonBody<ApiFail>(res);
    expect(body.error).toMatch(/trigger/i);
  });

  it('returns 400 for unknown trigger', async () => {
    const lobster = await registerLobster(server);
    const res = await server.honoApp.request(`/api/v1/lobster/${lobster.id}/emotion`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger: 'some_unknown_trigger' }),
    });
    expect(res.status).toBe(400);
    const body = await jsonBody<ApiFail>(res);
    expect(body.error).toMatch(/trigger/i);
  });

  it('returns 400 for invalid JSON body', async () => {
    const lobster = await registerLobster(server);
    const res = await server.honoApp.request(`/api/v1/lobster/${lobster.id}/emotion`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/lobster/:id/diary
// ---------------------------------------------------------------------------

describe('GET /api/v1/lobster/:id/diary', () => {
  let server: GatewayServer;

  beforeEach(() => {
    server = makeServer();
  });

  it('returns 404 when no diary exists yet', async () => {
    const lobster = await registerLobster(server);
    const res = await server.honoApp.request(`/api/v1/lobster/${lobster.id}/diary`);
    expect(res.status).toBe(404);
    const body = await jsonBody<ApiFail>(res);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/diary/i);
  });

  it('returns 404 for non-existent lobster', async () => {
    const res = await server.honoApp.request('/api/v1/lobster/ghost/diary');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/lobster/:id/personality
// ---------------------------------------------------------------------------

describe('GET /api/v1/lobster/:id/personality', () => {
  let server: GatewayServer;

  beforeEach(() => {
    server = makeServer();
  });

  it('returns personality DNA, archetype and dialogue style', async () => {
    const lobster = await registerLobster(server);
    const res = await server.honoApp.request(`/api/v1/lobster/${lobster.id}/personality`);

    expect(res.status).toBe(200);
    const body = await jsonBody<ApiOk<PersonalityResponse>>(res);
    expect(body.success).toBe(true);

    // DNA should be all-zero (default)
    expect(body.data.dna.introversion_extroversion).toBe(0);
    expect(body.data.dna.laziness_curiosity).toBe(0);

    // Archetype must be a non-empty string
    expect(typeof body.data.archetype).toBe('string');
    expect(body.data.archetype.length).toBeGreaterThan(0);

    // Dialogue style fields
    expect(typeof body.data.dialogueStyle.verbosity).toBe('string');
    expect(typeof body.data.dialogueStyle.tone).toBe('string');
    expect(typeof body.data.dialogueStyle.greeting).toBe('string');
    expect(typeof body.data.dialogueStyle.farewell).toBe('string');
    expect(typeof body.data.dialogueStyle.responseToCompliment).toBe('string');
  });

  it('returns 404 for non-existent lobster', async () => {
    const res = await server.honoApp.request('/api/v1/lobster/ghost/personality');
    expect(res.status).toBe(404);
    const body = await jsonBody<ApiFail>(res);
    expect(body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/weather
// ---------------------------------------------------------------------------

describe('GET /api/v1/weather', () => {
  let server: GatewayServer;

  beforeEach(() => {
    server = makeServer();
  });

  it('returns WeatherData and LobsterWeatherEffect for valid coords', async () => {
    const res = await server.honoApp.request('/api/v1/weather?lat=31.23&lon=121.47');
    expect(res.status).toBe(200);

    const body = await jsonBody<ApiOk<{ weather: WeatherData; effect: LobsterWeatherEffect }>>(res);
    expect(body.success).toBe(true);

    // Mock data always returns condition: 'clear'
    expect(body.data.weather.condition).toBe('clear');
    expect(typeof body.data.weather.temperature).toBe('number');
    expect(typeof body.data.weather.humidity).toBe('number');

    // Lobster effect should match clear sky
    expect(body.data.effect.scene).toBe('shallow_sea_sunny');
    expect(typeof body.data.effect.lobsterQuote).toBe('string');
    expect(typeof body.data.effect.ambientSound).toBe('string');
  });

  it('returns 400 when lat is missing', async () => {
    const res = await server.honoApp.request('/api/v1/weather?lon=121.47');
    expect(res.status).toBe(400);
    const body = await jsonBody<ApiFail>(res);
    expect(body.error).toMatch(/lat/i);
  });

  it('returns 400 when lon is missing', async () => {
    const res = await server.honoApp.request('/api/v1/weather?lat=31.23');
    expect(res.status).toBe(400);
    const body = await jsonBody<ApiFail>(res);
    expect(body.error).toMatch(/lon/i);
  });

  it('returns 400 when lat is not a number', async () => {
    const res = await server.honoApp.request('/api/v1/weather?lat=abc&lon=121.47');
    expect(res.status).toBe(400);
    const body = await jsonBody<ApiFail>(res);
    expect(body.error).toMatch(/lat/i);
  });

  it('returns 400 when lon is not a number', async () => {
    const res = await server.honoApp.request('/api/v1/weather?lat=31.23&lon=xyz');
    expect(res.status).toBe(400);
    const body = await jsonBody<ApiFail>(res);
    expect(body.error).toMatch(/lon/i);
  });

  it('returns 400 when lat is out of range', async () => {
    const res = await server.honoApp.request('/api/v1/weather?lat=91&lon=0');
    expect(res.status).toBe(400);
    const body = await jsonBody<ApiFail>(res);
    expect(body.error).toMatch(/lat/i);
  });

  it('returns 400 when lon is out of range', async () => {
    const res = await server.honoApp.request('/api/v1/weather?lat=0&lon=181');
    expect(res.status).toBe(400);
    const body = await jsonBody<ApiFail>(res);
    expect(body.error).toMatch(/lon/i);
  });

  it('accepts boundary coords (lat=90, lon=180)', async () => {
    const res = await server.honoApp.request('/api/v1/weather?lat=90&lon=180');
    expect(res.status).toBe(200);
  });

  it('accepts negative coords (southern/western hemisphere)', async () => {
    const res = await server.honoApp.request('/api/v1/weather?lat=-33.87&lon=151.21');
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Full flow: register → activity → emotion → state
// ---------------------------------------------------------------------------

describe('Full lobster flow', () => {
  let server: GatewayServer;

  beforeEach(() => {
    server = makeServer();
  });

  it('registers a lobster, posts an activity, and verifies updated state', async () => {
    // 1. Register
    const lobster = await registerLobster(server, { name: 'Lazaro', ownerId: 'owner99' });
    expect(lobster.id).toBeTruthy();
    expect(lobster.currentActivity).toBe('idle');

    // 2. Post activity
    const actRes = await server.honoApp.request('/api/v1/lobster/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lobsterId: lobster.id, type: 'subway', confidence: 0.95 }),
    });
    expect(actRes.status).toBe(200);
    const actBody = await jsonBody<ApiOk<{ behavior: LobsterBehavior }>>(actRes);
    expect(actBody.data.behavior.scene).toBe('coral_tunnel');
    expect(actBody.data.behavior.action).toBe('tunnel_train');

    // 3. Verify state reflects new activity
    const stateRes = await server.honoApp.request(`/api/v1/lobster/${lobster.id}/state`);
    const stateBody = await jsonBody<ApiOk<LobsterRecord>>(stateRes);
    expect(stateBody.data.currentActivity).toBe('subway');
    expect(stateBody.data.currentScene).toBe('coral_tunnel');

    // 4. Apply emotion trigger
    const emotRes = await server.honoApp.request(`/api/v1/lobster/${lobster.id}/emotion`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger: 'good_weather' }),
    });
    expect(emotRes.status).toBe(200);
    const emotBody = await jsonBody<ApiOk<EmotionState>>(emotRes);
    // good_weather: happy +8, warm +6, curious +4 — from baseline 50
    expect(emotBody.data.happy).toBe(58);
    expect(emotBody.data.warm).toBe(56);
    expect(emotBody.data.curious).toBe(54);

    // 5. State reflects updated emotion
    const finalState = await server.honoApp.request(`/api/v1/lobster/${lobster.id}/state`);
    const finalBody = await jsonBody<ApiOk<LobsterRecord>>(finalState);
    expect(finalBody.data.emotion.happy).toBe(58);
  });

  it('personality endpoint returns consistent data with registered lobster', async () => {
    const lobster = await registerLobster(server, { name: 'Philosophicus', ownerId: 'owner01' });

    const persRes = await server.honoApp.request(`/api/v1/lobster/${lobster.id}/personality`);
    expect(persRes.status).toBe(200);
    const persBody = await jsonBody<ApiOk<PersonalityResponse>>(persRes);

    // Default zero DNA → should yield neutral archetype with 躺平龙虾 core (laziness_curiosity dominant at 0, all zeros → first trait wins)
    expect(persBody.data.archetype).toBeTruthy();
    expect(persBody.data.dialogueStyle.verbosity).toBe('normal');
    expect(persBody.data.dialogueStyle.tone).toBe('neutral');
  });
});
