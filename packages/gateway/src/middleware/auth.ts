// @lobster-engine/gateway — Authentication Middleware

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Authentication mode used to verify the request. */
export type AuthMode = 'jwt' | 'api-key' | 'bot-token';

/** Role extracted from the authentication credential. */
export type AuthRole = 'admin' | 'service' | 'bot' | 'user';

/** Information attached to the Hono context after successful authentication. */
export interface AuthInfo {
  readonly mode: AuthMode;
  readonly subject: string;
  readonly role: AuthRole;
}

/** JWT claim set extracted during verification. */
export interface JwtClaims {
  readonly sub: string;
  readonly role: AuthRole;
  readonly exp: number;
  readonly iat?: number;
}

/**
 * Pluggable store for API key validation.
 * The default implementation uses an in-memory Map.
 */
export interface ApiKeyStore {
  /** Return the role associated with the key, or undefined if invalid. */
  resolve(key: string): Promise<AuthRole | undefined> | AuthRole | undefined;
}

/**
 * Pluggable store for bot token validation.
 * The default implementation uses an in-memory Map.
 */
export interface BotTokenStore {
  /** Return the bot subject (id) associated with the token, or undefined if invalid. */
  resolve(token: string): Promise<string | undefined> | string | undefined;
}

/** Configuration for JWT authentication. */
export interface JwtConfig {
  /** HMAC-SHA256 secret used to verify JWT signatures. */
  readonly secret: string;
  /**
   * Maximum allowed clock skew in seconds when checking expiration.
   * Defaults to 0.
   */
  readonly clockSkewSeconds?: number;
}

/** Configuration for API key authentication. */
export interface ApiKeyConfig {
  readonly store: ApiKeyStore;
}

/** Configuration for bot token authentication. */
export interface BotTokenConfig {
  readonly store: BotTokenStore;
}

/** Top-level auth middleware configuration. */
export interface AuthConfig {
  readonly jwt?: JwtConfig;
  readonly apiKey?: ApiKeyConfig;
  readonly botToken?: BotTokenConfig;
  /**
   * Paths that bypass authentication entirely.
   * Defaults to `['/health', '/metrics']`.
   */
  readonly publicPaths?: readonly string[];
}

// ---------------------------------------------------------------------------
// In-memory stores (default implementations)
// ---------------------------------------------------------------------------

/**
 * Simple in-memory API key store backed by a `Map<key, role>`.
 * Suitable for development / testing. Replace with a database-backed
 * implementation in production.
 */
export class InMemoryApiKeyStore implements ApiKeyStore {
  private readonly keys: ReadonlyMap<string, AuthRole>;

  constructor(entries: ReadonlyArray<readonly [string, AuthRole]>) {
    this.keys = new Map(entries);
  }

  resolve(key: string): AuthRole | undefined {
    return (this.keys as Map<string, AuthRole>).get(key);
  }
}

/**
 * Simple in-memory bot token store backed by a `Map<token, botId>`.
 */
export class InMemoryBotTokenStore implements BotTokenStore {
  private readonly tokens: ReadonlyMap<string, string>;

  constructor(entries: ReadonlyArray<readonly [string, string]>) {
    this.tokens = new Map(entries);
  }

  resolve(token: string): string | undefined {
    return (this.tokens as Map<string, string>).get(token);
  }
}

// ---------------------------------------------------------------------------
// JWT helpers (Node.js crypto only, no external libraries)
// ---------------------------------------------------------------------------

const BASE64URL_REGEX = /^[A-Za-z0-9_-]+$/;

function base64UrlDecode(input: string): Buffer {
  // Replace URL-safe characters back to standard base64
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64');
}

function base64UrlEncode(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const VALID_ROLES: ReadonlySet<string> = new Set<AuthRole>(['admin', 'service', 'bot', 'user']);

function isValidRole(value: unknown): value is AuthRole {
  return typeof value === 'string' && VALID_ROLES.has(value);
}

/**
 * Decode and verify a JWT signed with HMAC-SHA256.
 * Returns the claims on success, or an error message string on failure.
 */
export function verifyJwt(
  token: string,
  secret: string,
  clockSkewSeconds: number = 0,
): JwtClaims | string {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return 'Malformed JWT: expected 3 segments';
  }

  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  // Validate base64url encoding
  if (!BASE64URL_REGEX.test(headerB64) || !BASE64URL_REGEX.test(payloadB64) || !BASE64URL_REGEX.test(signatureB64)) {
    return 'Malformed JWT: invalid base64url encoding';
  }

  // Verify header
  let header: unknown;
  try {
    header = JSON.parse(base64UrlDecode(headerB64).toString('utf-8'));
  } catch {
    return 'Malformed JWT: unable to parse header';
  }

  if (
    typeof header !== 'object' ||
    header === null ||
    (header as Record<string, unknown>)['alg'] !== 'HS256'
  ) {
    return 'Unsupported JWT algorithm: only HS256 is accepted';
  }

  // Verify signature using timing-safe comparison
  const signingInput = `${headerB64}.${payloadB64}`;
  const expectedSig = base64UrlEncode(
    createHmac('sha256', secret).update(signingInput).digest(),
  );
  const actualSig = signatureB64;

  const expectedBuf = Buffer.from(expectedSig, 'utf-8');
  const actualBuf = Buffer.from(actualSig, 'utf-8');

  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    return 'Invalid JWT signature';
  }

  // Decode payload
  let payload: unknown;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf-8'));
  } catch {
    return 'Malformed JWT: unable to parse payload';
  }

  if (typeof payload !== 'object' || payload === null) {
    return 'Malformed JWT: payload is not an object';
  }

  const claims = payload as Record<string, unknown>;

  // Validate required claims
  if (typeof claims['sub'] !== 'string' || claims['sub'].length === 0) {
    return 'JWT missing required claim: sub';
  }
  if (!isValidRole(claims['role'])) {
    return 'JWT missing or invalid claim: role';
  }
  if (typeof claims['exp'] !== 'number') {
    return 'JWT missing required claim: exp';
  }

  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (claims['exp'] as number + clockSkewSeconds < now) {
    return 'JWT has expired';
  }

  return {
    sub: claims['sub'] as string,
    role: claims['role'] as AuthRole,
    exp: claims['exp'] as number,
    iat: typeof claims['iat'] === 'number' ? claims['iat'] as number : undefined,
  };
}

// ---------------------------------------------------------------------------
// Error response helper
// ---------------------------------------------------------------------------

interface AuthErrorBody {
  readonly error: 'Unauthorized';
  readonly message: string;
}

function unauthorizedResponse(message: string): AuthErrorBody {
  return { error: 'Unauthorized', message };
}

// ---------------------------------------------------------------------------
// Default public paths
// ---------------------------------------------------------------------------

const DEFAULT_PUBLIC_PATHS: readonly string[] = ['/health', '/metrics'];

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

/**
 * Creates a Hono middleware that authenticates requests using one or more
 * of the configured modes (JWT, API key, bot token).
 *
 * Authentication is attempted in the following order of precedence:
 * 1. `Authorization: Bearer <jwt>` header (JWT mode)
 * 2. `X-API-Key` header (API key mode)
 * 3. `X-Bot-Token` header (Bot token mode)
 *
 * The first matching credential is used. If none match, the request is
 * rejected with a 401 Unauthorized response.
 *
 * On success, the middleware sets `c.set('auth', authInfo)` for downstream
 * handlers.
 */
export function createAuthMiddleware(config: AuthConfig): MiddlewareHandler {
  const publicPaths = new Set(config.publicPaths ?? DEFAULT_PUBLIC_PATHS);

  const hasAnyMode = config.jwt !== undefined
    || config.apiKey !== undefined
    || config.botToken !== undefined;

  if (!hasAnyMode) {
    throw new Error('AuthConfig must enable at least one authentication mode');
  }

  const middleware: MiddlewareHandler = async (c, next) => {
    // Skip authentication for public paths
    const path = new URL(c.req.url).pathname;
    if (publicPaths.has(path)) {
      await next();
      return;
    }

    // --- Attempt JWT ---
    if (config.jwt !== undefined) {
      const authHeader = c.req.header('Authorization');
      if (authHeader !== undefined && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const result = verifyJwt(token, config.jwt.secret, config.jwt.clockSkewSeconds);

        if (typeof result === 'string') {
          return c.json(unauthorizedResponse(result), 401);
        }

        const authInfo: AuthInfo = {
          mode: 'jwt',
          subject: result.sub,
          role: result.role,
        };
        c.set('auth', authInfo);
        await next();
        return;
      }
    }

    // --- Attempt API Key ---
    if (config.apiKey !== undefined) {
      const apiKeyHeader = c.req.header('X-API-Key');
      if (apiKeyHeader !== undefined && apiKeyHeader.length > 0) {
        const role = await config.apiKey.store.resolve(apiKeyHeader);

        if (role === undefined) {
          return c.json(unauthorizedResponse('Invalid API key'), 401);
        }

        const authInfo: AuthInfo = {
          mode: 'api-key',
          subject: `apikey:${apiKeyHeader.slice(0, 8)}`,
          role,
        };
        c.set('auth', authInfo);
        await next();
        return;
      }
    }

    // --- Attempt Bot Token ---
    if (config.botToken !== undefined) {
      const botTokenHeader = c.req.header('X-Bot-Token');
      if (botTokenHeader !== undefined && botTokenHeader.length > 0) {
        const botId = await config.botToken.store.resolve(botTokenHeader);

        if (botId === undefined) {
          return c.json(unauthorizedResponse('Invalid bot token'), 401);
        }

        const authInfo: AuthInfo = {
          mode: 'bot-token',
          subject: botId,
          role: 'bot',
        };
        c.set('auth', authInfo);
        await next();
        return;
      }
    }

    // No credentials provided at all
    return c.json(
      unauthorizedResponse('Missing authentication credentials'),
      401,
    );
  };

  return middleware;
}
