// @lobster-engine/gateway — Public API

export type { GatewayConfig, BotRecord, SceneRecord, SanitizedBotRecord } from './server.js';
export { GatewayServer } from './server.js';

export { MetricsRegistry, createMetricsMiddleware, createMetricsHandler } from './metrics.js';

export { generateOpenAPISpec, registerOpenAPIRoute } from './openapi.js';

export type { SSEConfig, SSEClient } from './sse.js';
export { SSEManager, createSSEHandler } from './sse.js';

export type { WSConfig, WSClient, OutboundMessage } from './ws.js';
export { WSManager, createWSHandler } from './ws.js';

export type { EngineStore, MCPHandlerOptions } from './mcp.js';
export {
  LobsterMCPServer,
  createMCPHandler,
  createStdioServer,
  createEngineStore,
} from './mcp.js';

import { GatewayServer } from './server.js';
import type { GatewayConfig } from './server.js';

/**
 * Convenience factory that creates a GatewayServer with sensible defaults.
 */
export function createServer(config?: Partial<GatewayConfig>): GatewayServer {
  const resolved: GatewayConfig = {
    port: config?.port ?? 3000,
    host: config?.host ?? '0.0.0.0',
    jwtSecret: config?.jwtSecret,
    apiKeys: config?.apiKeys,
  };
  return new GatewayServer(resolved);
}
