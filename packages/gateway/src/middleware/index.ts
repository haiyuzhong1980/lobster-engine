// @lobster-engine/gateway — Middleware barrel export

export {
  createAuthMiddleware,
  verifyJwt,
  InMemoryApiKeyStore,
  InMemoryBotTokenStore,
} from './auth.js';

export type {
  AuthConfig,
  AuthInfo,
  AuthMode,
  AuthRole,
  JwtClaims,
  JwtConfig,
  ApiKeyConfig,
  ApiKeyStore,
  BotTokenConfig,
  BotTokenStore,
} from './auth.js';

export { createCorsMiddleware, createSecurityHeadersMiddleware } from './cors.js';
export type { CorsConfig } from './cors.js';

export { createRateLimitMiddleware } from './rate-limit.js';
export type { RateLimitConfig } from './rate-limit.js';
