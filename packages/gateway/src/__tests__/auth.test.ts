// @lobster-engine/gateway — Auth middleware tests

import { createHmac } from 'node:crypto';
import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import {
  createAuthMiddleware,
  verifyJwt,
  InMemoryApiKeyStore,
  InMemoryBotTokenStore,
} from '../middleware/auth.js';
import type { AuthConfig, AuthInfo, AuthRole } from '../middleware/auth.js';

// ---------------------------------------------------------------------------
// JWT helpers for tests
// ---------------------------------------------------------------------------

function base64UrlEncode(data: Buffer | string): string {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function createTestJwt(
  payload: Record<string, unknown>,
  secret: string,
  alg: string = 'HS256',
): string {
  const header = base64UrlEncode(JSON.stringify({ alg, typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = base64UrlEncode(
    createHmac('sha256', secret).update(`${header}.${body}`).digest(),
  );
  return `${header}.${body}.${signature}`;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_SECRET = 'lobster-test-secret-key-256-bits!';
const TEST_API_KEY = 'lob_key_test_abc123def456';
const TEST_BOT_TOKEN = 'bot_tok_werewolf_001';
const TEST_BOT_ID = 'bot-uuid-001';

function futureExp(): number {
  return Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
}

function pastExp(): number {
  return Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
}

// ---------------------------------------------------------------------------
// Test app factory
// ---------------------------------------------------------------------------

function createTestApp(config: AuthConfig): Hono {
  const app = new Hono();

  app.use('*', createAuthMiddleware(config));

  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.get('/metrics', (c) => c.json({ uptime: 123 }));
  app.get('/api/v1/protected', (c) => {
    const auth = (c as unknown as { get(key: string): unknown }).get('auth') as AuthInfo;
    return c.json({ auth });
  });
  app.post('/api/v1/data', (c) => {
    const auth = (c as unknown as { get(key: string): unknown }).get('auth') as AuthInfo;
    return c.json({ auth });
  });

  return app;
}

// ---------------------------------------------------------------------------
// Full config with all three modes
// ---------------------------------------------------------------------------

function fullConfig(): AuthConfig {
  return {
    jwt: { secret: TEST_SECRET },
    apiKey: {
      store: new InMemoryApiKeyStore([
        [TEST_API_KEY, 'service' as AuthRole],
      ]),
    },
    botToken: {
      store: new InMemoryBotTokenStore([
        [TEST_BOT_TOKEN, TEST_BOT_ID],
      ]),
    },
  };
}

// ===========================================================================
// verifyJwt unit tests
// ===========================================================================

describe('verifyJwt', () => {
  it('should verify a valid JWT and return claims', () => {
    const token = createTestJwt(
      { sub: 'user-1', role: 'admin', exp: futureExp() },
      TEST_SECRET,
    );
    const result = verifyJwt(token, TEST_SECRET);
    expect(result).toEqual(
      expect.objectContaining({ sub: 'user-1', role: 'admin' }),
    );
  });

  it('should return error for malformed token (wrong number of segments)', () => {
    const result = verifyJwt('only.two', TEST_SECRET);
    expect(result).toBe('Malformed JWT: expected 3 segments');
  });

  it('should return error for expired token', () => {
    const token = createTestJwt(
      { sub: 'user-1', role: 'admin', exp: pastExp() },
      TEST_SECRET,
    );
    const result = verifyJwt(token, TEST_SECRET);
    expect(result).toBe('JWT has expired');
  });

  it('should accept expired token within clock skew tolerance', () => {
    const justExpired = Math.floor(Date.now() / 1000) - 5;
    const token = createTestJwt(
      { sub: 'user-1', role: 'admin', exp: justExpired },
      TEST_SECRET,
    );
    const result = verifyJwt(token, TEST_SECRET, 10);
    expect(typeof result).toBe('object');
    expect((result as { sub: string }).sub).toBe('user-1');
  });

  it('should return error for invalid signature', () => {
    const token = createTestJwt(
      { sub: 'user-1', role: 'admin', exp: futureExp() },
      'wrong-secret',
    );
    const result = verifyJwt(token, TEST_SECRET);
    expect(result).toBe('Invalid JWT signature');
  });

  it('should return error for unsupported algorithm', () => {
    // Manually craft a token with alg=RS256
    const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const body = base64UrlEncode(
      JSON.stringify({ sub: 'user-1', role: 'admin', exp: futureExp() }),
    );
    const sig = base64UrlEncode(
      createHmac('sha256', TEST_SECRET).update(`${header}.${body}`).digest(),
    );
    const result = verifyJwt(`${header}.${body}.${sig}`, TEST_SECRET);
    expect(result).toBe('Unsupported JWT algorithm: only HS256 is accepted');
  });

  it('should return error when sub claim is missing', () => {
    const token = createTestJwt(
      { role: 'admin', exp: futureExp() },
      TEST_SECRET,
    );
    const result = verifyJwt(token, TEST_SECRET);
    expect(result).toBe('JWT missing required claim: sub');
  });

  it('should return error when role claim is invalid', () => {
    const token = createTestJwt(
      { sub: 'user-1', role: 'superadmin', exp: futureExp() },
      TEST_SECRET,
    );
    const result = verifyJwt(token, TEST_SECRET);
    expect(result).toBe('JWT missing or invalid claim: role');
  });

  it('should return error when exp claim is missing', () => {
    const token = createTestJwt(
      { sub: 'user-1', role: 'admin' },
      TEST_SECRET,
    );
    const result = verifyJwt(token, TEST_SECRET);
    expect(result).toBe('JWT missing required claim: exp');
  });

  it('should include iat claim when present', () => {
    const iat = Math.floor(Date.now() / 1000);
    const token = createTestJwt(
      { sub: 'user-1', role: 'user', exp: futureExp(), iat },
      TEST_SECRET,
    );
    const result = verifyJwt(token, TEST_SECRET);
    expect(typeof result).toBe('object');
    expect((result as { iat: number }).iat).toBe(iat);
  });
});

// ===========================================================================
// InMemoryApiKeyStore unit tests
// ===========================================================================

describe('InMemoryApiKeyStore', () => {
  it('should resolve a known key', () => {
    const store = new InMemoryApiKeyStore([['key-1', 'admin']]);
    expect(store.resolve('key-1')).toBe('admin');
  });

  it('should return undefined for an unknown key', () => {
    const store = new InMemoryApiKeyStore([['key-1', 'admin']]);
    expect(store.resolve('key-2')).toBeUndefined();
  });
});

// ===========================================================================
// InMemoryBotTokenStore unit tests
// ===========================================================================

describe('InMemoryBotTokenStore', () => {
  it('should resolve a known token', () => {
    const store = new InMemoryBotTokenStore([['tok-1', 'bot-1']]);
    expect(store.resolve('tok-1')).toBe('bot-1');
  });

  it('should return undefined for an unknown token', () => {
    const store = new InMemoryBotTokenStore([['tok-1', 'bot-1']]);
    expect(store.resolve('tok-2')).toBeUndefined();
  });
});

// ===========================================================================
// createAuthMiddleware tests
// ===========================================================================

describe('createAuthMiddleware', () => {
  it('should throw when no auth mode is configured', () => {
    expect(() => createAuthMiddleware({})).toThrow(
      'AuthConfig must enable at least one authentication mode',
    );
  });

  // -------------------------------------------------------------------------
  // Public paths bypass
  // -------------------------------------------------------------------------

  describe('public paths', () => {
    let app: Hono;

    beforeEach(() => {
      app = createTestApp(fullConfig());
    });

    it('should allow /health without credentials', async () => {
      const res = await app.request('/health');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ status: 'ok' });
    });

    it('should allow /metrics without credentials', async () => {
      const res = await app.request('/metrics');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ uptime: 123 });
    });

    it('should support custom public paths', async () => {
      const customApp = new Hono();
      customApp.use(
        '*',
        createAuthMiddleware({
          jwt: { secret: TEST_SECRET },
          publicPaths: ['/health', '/custom-public'],
        }),
      );
      customApp.get('/custom-public', (c) => c.json({ ok: true }));

      const res = await customApp.request('/custom-public');
      expect(res.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // JWT authentication
  // -------------------------------------------------------------------------

  describe('JWT mode', () => {
    let app: Hono;

    beforeEach(() => {
      app = createTestApp(fullConfig());
    });

    it('should authenticate with a valid JWT', async () => {
      const token = createTestJwt(
        { sub: 'user-42', role: 'admin', exp: futureExp() },
        TEST_SECRET,
      );
      const res = await app.request('/api/v1/protected', {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { auth: AuthInfo };
      expect(body.auth.mode).toBe('jwt');
      expect(body.auth.subject).toBe('user-42');
      expect(body.auth.role).toBe('admin');
    });

    it('should reject an expired JWT with 401', async () => {
      const token = createTestJwt(
        { sub: 'user-42', role: 'admin', exp: pastExp() },
        TEST_SECRET,
      );
      const res = await app.request('/api/v1/protected', {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: string; message: string };
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toBe('JWT has expired');
    });

    it('should reject a JWT signed with the wrong secret', async () => {
      const token = createTestJwt(
        { sub: 'user-42', role: 'admin', exp: futureExp() },
        'wrong-secret-key',
      );
      const res = await app.request('/api/v1/protected', {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: string; message: string };
      expect(body.message).toBe('Invalid JWT signature');
    });
  });

  // -------------------------------------------------------------------------
  // API Key authentication
  // -------------------------------------------------------------------------

  describe('API Key mode', () => {
    let app: Hono;

    beforeEach(() => {
      app = createTestApp(fullConfig());
    });

    it('should authenticate with a valid API key', async () => {
      const res = await app.request('/api/v1/protected', {
        headers: { 'X-API-Key': TEST_API_KEY },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { auth: AuthInfo };
      expect(body.auth.mode).toBe('api-key');
      expect(body.auth.role).toBe('service');
      expect(body.auth.subject).toContain('apikey:');
    });

    it('should reject an invalid API key with 401', async () => {
      const res = await app.request('/api/v1/protected', {
        headers: { 'X-API-Key': 'invalid-key' },
      });
      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: string; message: string };
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toBe('Invalid API key');
    });
  });

  // -------------------------------------------------------------------------
  // Bot Token authentication
  // -------------------------------------------------------------------------

  describe('Bot Token mode', () => {
    let app: Hono;

    beforeEach(() => {
      app = createTestApp(fullConfig());
    });

    it('should authenticate with a valid bot token', async () => {
      const res = await app.request('/api/v1/protected', {
        headers: { 'X-Bot-Token': TEST_BOT_TOKEN },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { auth: AuthInfo };
      expect(body.auth.mode).toBe('bot-token');
      expect(body.auth.subject).toBe(TEST_BOT_ID);
      expect(body.auth.role).toBe('bot');
    });

    it('should reject an invalid bot token with 401', async () => {
      const res = await app.request('/api/v1/protected', {
        headers: { 'X-Bot-Token': 'invalid-token' },
      });
      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: string; message: string };
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toBe('Invalid bot token');
    });
  });

  // -------------------------------------------------------------------------
  // No credentials
  // -------------------------------------------------------------------------

  describe('no credentials', () => {
    it('should reject with 401 when no auth headers are present', async () => {
      const app = createTestApp(fullConfig());
      const res = await app.request('/api/v1/protected');
      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: string; message: string };
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toBe('Missing authentication credentials');
    });
  });

  // -------------------------------------------------------------------------
  // Precedence
  // -------------------------------------------------------------------------

  describe('mode precedence', () => {
    it('should prefer JWT over API key when both headers are present', async () => {
      const app = createTestApp(fullConfig());
      const token = createTestJwt(
        { sub: 'jwt-user', role: 'admin', exp: futureExp() },
        TEST_SECRET,
      );
      const res = await app.request('/api/v1/protected', {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-API-Key': TEST_API_KEY,
        },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { auth: AuthInfo };
      expect(body.auth.mode).toBe('jwt');
    });

    it('should prefer API key over bot token when both headers are present', async () => {
      const app = createTestApp(fullConfig());
      const res = await app.request('/api/v1/protected', {
        headers: {
          'X-API-Key': TEST_API_KEY,
          'X-Bot-Token': TEST_BOT_TOKEN,
        },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { auth: AuthInfo };
      expect(body.auth.mode).toBe('api-key');
    });
  });

  // -------------------------------------------------------------------------
  // Single mode configs
  // -------------------------------------------------------------------------

  describe('single mode (JWT only)', () => {
    it('should reject when no JWT header is provided', async () => {
      const app = createTestApp({ jwt: { secret: TEST_SECRET } });
      const res = await app.request('/api/v1/protected');
      expect(res.status).toBe(401);
    });

    it('should ignore API key header when JWT-only config', async () => {
      const app = createTestApp({ jwt: { secret: TEST_SECRET } });
      const res = await app.request('/api/v1/protected', {
        headers: { 'X-API-Key': TEST_API_KEY },
      });
      expect(res.status).toBe(401);
    });
  });

  describe('single mode (API key only)', () => {
    it('should reject when no API key header is provided', async () => {
      const app = createTestApp({
        apiKey: {
          store: new InMemoryApiKeyStore([[TEST_API_KEY, 'admin']]),
        },
      });
      const res = await app.request('/api/v1/protected');
      expect(res.status).toBe(401);
    });
  });

  describe('single mode (bot token only)', () => {
    it('should authenticate with bot token when only mode', async () => {
      const app = createTestApp({
        botToken: {
          store: new InMemoryBotTokenStore([[TEST_BOT_TOKEN, TEST_BOT_ID]]),
        },
      });
      const res = await app.request('/api/v1/protected', {
        headers: { 'X-Bot-Token': TEST_BOT_TOKEN },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { auth: AuthInfo };
      expect(body.auth.mode).toBe('bot-token');
    });
  });
});
