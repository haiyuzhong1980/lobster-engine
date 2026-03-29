// @lobster-engine/gateway — LobsterMCPServer
//
// Exposes Lobster Engine operations as MCP tools via the Model Context Protocol.
// Supports two transports:
//   • SSE   — createMCPHandler() returns a Hono route handler for /mcp
//   • stdio — createStdioServer() launches a standalone stdio MCP process

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import type { Context, Hono } from 'hono';
import type { BotRecord, SceneRecord } from './server.js';

// ---------------------------------------------------------------------------
// Engine state interface — allows the MCP server to operate against the same
// in-memory stores used by GatewayServer without coupling to its internals.
// ---------------------------------------------------------------------------

export interface EngineStore {
  readonly bots: ReadonlyMap<string, BotRecord>;
  readonly scenes: ReadonlyMap<string, SceneRecord>;
  addBot(bot: BotRecord): void;
  addScene(scene: SceneRecord): void;
  updateScene(scene: SceneRecord): void;
}

// ---------------------------------------------------------------------------
// Tool result helpers (MCP CallToolResult content items)
// ---------------------------------------------------------------------------

function textContent(text: string): { type: 'text'; text: string } {
  return { type: 'text' as const, text };
}

function jsonContent(value: unknown): { type: 'text'; text: string } {
  return textContent(JSON.stringify(value, null, 2));
}

// ---------------------------------------------------------------------------
// LobsterMCPServer
// ---------------------------------------------------------------------------

/**
 * Wraps a Lobster Engine store and registers 8 MCP tools against an McpServer
 * instance.  The same instance can be connected to any transport (SSE or
 * stdio) without rebuilding tools.
 */
export class LobsterMCPServer {
  readonly mcpServer: McpServer;
  private readonly store: EngineStore;

  constructor(store: EngineStore) {
    this.store = store;
    this.mcpServer = new McpServer(
      {
        name: 'lobster-engine',
        version: '0.0.1',
      },
      {
        instructions:
          'Lobster Engine MCP interface. Use these tools to manage bots and scenes ' +
          'in the engine runtime.',
      },
    );

    this.registerTools();
  }

  // -------------------------------------------------------------------------
  // Tool registration
  // -------------------------------------------------------------------------

  private registerTools(): void {
    this.registerListBots();
    this.registerRegisterBot();
    this.registerBotStatus();
    this.registerListScenes();
    this.registerCreateScene();
    this.registerSubmitAction();
    this.registerSceneStatus();
    this.registerEngineHealth();
  }

  /** 1. lobster_list_bots — List all registered bots with their status. */
  private registerListBots(): void {
    this.mcpServer.registerTool(
      'lobster_list_bots',
      {
        description:
          'List all bots currently registered with the Lobster Engine, including ' +
          'their id, platform, and status.',
      },
      () => {
        const bots = Array.from(this.store.bots.values());
        return {
          content: [
            jsonContent({
              total: bots.length,
              bots: bots.map((b) => ({
                id: b.id,
                platform: b.platform,
                status: b.status,
                createdAt: b.createdAt,
              })),
            }),
          ],
        };
      },
    );
  }

  /** 2. lobster_register_bot — Register a new bot. */
  private registerRegisterBot(): void {
    this.mcpServer.registerTool(
      'lobster_register_bot',
      {
        description: 'Register a new bot with the engine. Returns the created bot record.',
        inputSchema: {
          name: z.string().min(1).describe('Human-readable name for the bot'),
          platform: z
            .string()
            .min(1)
            .describe('Platform identifier, e.g. "telegram", "discord", "coze"'),
          metadata: z
            .record(z.string(), z.unknown())
            .optional()
            .describe('Optional arbitrary metadata to attach to the bot'),
        },
      },
      (args) => {
        const id = crypto.randomUUID();
        const now = Date.now();

        const bot: BotRecord = {
          id,
          platform: args.platform,
          token: crypto.randomUUID(),
          metadata: args.metadata ?? {},
          status: 'idle',
          createdAt: now,
          updatedAt: now,
        };

        this.store.addBot(bot);

        return {
          content: [jsonContent({ success: true, bot })],
        };
      },
    );
  }

  /** 3. lobster_bot_status — Get the status of a specific bot. */
  private registerBotStatus(): void {
    this.mcpServer.registerTool(
      'lobster_bot_status',
      {
        description: 'Retrieve the full record of a specific bot by its id.',
        inputSchema: {
          botId: z.string().min(1).describe('The unique bot identifier'),
        },
      },
      (args) => {
        const bot = this.store.bots.get(args.botId);

        if (bot === undefined) {
          return {
            isError: true,
            content: [textContent(`Bot "${args.botId}" not found`)],
          };
        }

        return { content: [jsonContent(bot)] };
      },
    );
  }

  /** 4. lobster_list_scenes — List all active scenes. */
  private registerListScenes(): void {
    this.mcpServer.registerTool(
      'lobster_list_scenes',
      {
        description:
          'List all scenes in the engine. Optionally filter by status ' +
          '(waiting | active | paused | ended).',
        inputSchema: {
          status: z
            .enum(['waiting', 'active', 'paused', 'ended'])
            .optional()
            .describe('Filter scenes by status'),
        },
      },
      (args) => {
        let scenes = Array.from(this.store.scenes.values());

        if (args.status !== undefined) {
          scenes = scenes.filter((s) => s.status === args.status);
        }

        return {
          content: [
            jsonContent({
              total: scenes.length,
              scenes: scenes.map((s) => ({
                id: s.id,
                type: s.type,
                name: s.name,
                status: s.status,
                playerCount: s.playerCount,
                botIds: s.botIds,
              })),
            }),
          ],
        };
      },
    );
  }

  /** 5. lobster_create_scene — Create a scene and add bots to it. */
  private registerCreateScene(): void {
    this.mcpServer.registerTool(
      'lobster_create_scene',
      {
        description:
          'Create a new scene (or join an existing one) and assign bots to it. ' +
          'Returns the resulting SceneRecord.',
        inputSchema: {
          sceneType: z
            .string()
            .min(1)
            .describe('Scene type identifier, e.g. "werewolf", "customer-service"'),
          botIds: z
            .array(z.string().min(1))
            .min(1)
            .describe('List of bot ids to add to the scene'),
          sceneName: z.string().optional().describe('Optional display name for the scene'),
          sceneId: z
            .string()
            .optional()
            .describe('Optional explicit scene id; one is generated if omitted'),
          config: z
            .record(z.string(), z.unknown())
            .optional()
            .describe('Optional scene configuration object'),
        },
      },
      (args) => {
        // Validate all bots exist
        const missing = args.botIds.filter((id) => !this.store.bots.has(id));
        if (missing.length > 0) {
          return {
            isError: true,
            content: [textContent(`Unknown bot ids: ${missing.join(', ')}`)],
          };
        }

        const sceneId = args.sceneId ?? `${args.sceneType}:${crypto.randomUUID()}`;
        const existing = this.store.scenes.get(sceneId);
        const now = Date.now();

        if (existing !== undefined) {
          // Merge new botIds without duplicates
          const mergedIds = Array.from(new Set([...existing.botIds, ...args.botIds]));
          const updated: SceneRecord = {
            ...existing,
            botIds: mergedIds,
            playerCount: mergedIds.length,
            updatedAt: now,
          };
          this.store.updateScene(updated);
          return { content: [jsonContent({ success: true, scene: updated })] };
        }

        const scene: SceneRecord = {
          id: sceneId,
          type: args.sceneType,
          name: args.sceneName ?? args.sceneType,
          status: 'waiting',
          playerCount: args.botIds.length,
          botIds: args.botIds,
          config: args.config ?? {},
          createdAt: now,
          updatedAt: now,
        };

        this.store.addScene(scene);
        return { content: [jsonContent({ success: true, scene })] };
      },
    );
  }

  /** 6. lobster_submit_action — Submit an action for a bot inside a scene. */
  private registerSubmitAction(): void {
    this.mcpServer.registerTool(
      'lobster_submit_action',
      {
        description:
          'Submit an action on behalf of a bot that is a member of the given scene. ' +
          'Returns an action receipt with a server-side timestamp.',
        inputSchema: {
          botId: z.string().min(1).describe('The id of the bot performing the action'),
          sceneId: z.string().min(1).describe('The id of the scene the action targets'),
          actionType: z
            .string()
            .min(1)
            .describe('Action type string, e.g. "speak", "vote", "move"'),
          content: z.string().describe('Text content or payload for the action'),
          target: z
            .string()
            .optional()
            .describe('Optional target bot id or entity the action is directed at'),
        },
      },
      (args) => {
        const scene = this.store.scenes.get(args.sceneId);
        if (scene === undefined) {
          return {
            isError: true,
            content: [textContent(`Scene "${args.sceneId}" not found`)],
          };
        }

        if (!scene.botIds.includes(args.botId)) {
          return {
            isError: true,
            content: [
              textContent(
                `Bot "${args.botId}" is not a member of scene "${args.sceneId}"`,
              ),
            ],
          };
        }

        const receipt = {
          sceneId: args.sceneId,
          botId: args.botId,
          type: args.actionType,
          content: args.content,
          target: args.target,
          timestamp: Date.now(),
        };

        return { content: [jsonContent({ success: true, receipt })] };
      },
    );
  }

  /** 7. lobster_scene_status — Get full state of a scene. */
  private registerSceneStatus(): void {
    this.mcpServer.registerTool(
      'lobster_scene_status',
      {
        description: 'Retrieve the full SceneRecord for a specific scene by its id.',
        inputSchema: {
          sceneId: z.string().min(1).describe('The unique scene identifier'),
        },
      },
      (args) => {
        const scene = this.store.scenes.get(args.sceneId);
        if (scene === undefined) {
          return {
            isError: true,
            content: [textContent(`Scene "${args.sceneId}" not found`)],
          };
        }

        return { content: [jsonContent(scene)] };
      },
    );
  }

  /** 8. lobster_engine_health — Engine health check. */
  private registerEngineHealth(): void {
    this.mcpServer.registerTool(
      'lobster_engine_health',
      {
        description:
          'Return a health snapshot of the Lobster Engine including bot count, ' +
          'scene count, and memory usage.',
      },
      () => {
        const scenesArr = Array.from(this.store.scenes.values());
        const botsArr = Array.from(this.store.bots.values());

        const scenesByStatus = scenesArr.reduce<Record<string, number>>((acc, s) => {
          return { ...acc, [s.status]: (acc[s.status] ?? 0) + 1 };
        }, {});

        const botsByStatus = botsArr.reduce<Record<string, number>>((acc, b) => {
          return { ...acc, [b.status]: (acc[b.status] ?? 0) + 1 };
        }, {});

        return {
          content: [
            jsonContent({
              status: 'ok',
              timestamp: Date.now(),
              uptime: process.uptime(),
              bots: { total: botsArr.length, byStatus: botsByStatus },
              scenes: { total: scenesArr.length, byStatus: scenesByStatus },
              memory: process.memoryUsage(),
            }),
          ],
        };
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Transport factory: SSE (Hono route handler)
// ---------------------------------------------------------------------------

/**
 * Options for the SSE MCP handler.
 */
export interface MCPHandlerOptions {
  /** Base path used as the POST message endpoint. Defaults to "/mcp/message". */
  readonly messagePath?: string;
}

/**
 * Session map used internally to correlate SSE connections with POST messages.
 */
type SessionMap = Map<string, SSEServerTransport>;

/**
 * Creates a pair of Hono route-registration functions that together implement
 * the legacy SSE MCP transport on a Hono application.
 *
 * Usage:
 * ```ts
 * const store = createEngineStore();
 * const { mountMCP } = createMCPHandler(store);
 * mountMCP(app);                // registers GET /mcp and POST /mcp/message
 * ```
 */
export function createMCPHandler(
  store: EngineStore,
  options: MCPHandlerOptions = {},
): {
  mountMCP: (app: Hono) => void;
} {
  const messagePath = options.messagePath ?? '/mcp/message';
  const sessions: SessionMap = new Map();

  return {
    mountMCP(app: Hono): void {
      // SECURITY NOTE (HIGH-07): /mcp and /mcp/message are NOT in the public
      // paths list and therefore must be covered by the global auth middleware
      // registered on the Hono app before mountMCP() is called.  Do NOT add
      // /mcp or /mcp/message to any public/unauthenticated bypass list.

      // GET /mcp — establishes the SSE stream
      app.get('/mcp', async (c: Context) => {
        // SSEServerTransport requires a raw Node.js ServerResponse.
        // Hono on Node wraps it, so we extract it from the raw context.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = (c.env as any)?.outgoing as import('node:http').ServerResponse | undefined;

        if (raw === undefined) {
          return c.json({ error: 'SSE transport requires a Node.js HTTP server' }, 500);
        }

        const mcpServer = new LobsterMCPServer(store);
        const transport = new SSEServerTransport(messagePath, raw);

        sessions.set(transport.sessionId, transport);

        transport.onclose = () => {
          sessions.delete(transport.sessionId);
        };

        await mcpServer.mcpServer.connect(transport);

        // The response is handled by the SSEServerTransport — we return an
        // empty Hono response to prevent double-writing headers.
        return new Response(null, { status: 200 });
      });

      // POST /mcp/message — receives JSON-RPC messages from the client
      app.post(messagePath, async (c: Context) => {
        const sessionId = c.req.header('x-session-id') ?? c.req.query('sessionId');

        if (sessionId === undefined) {
          return c.json({ error: 'Missing sessionId' }, 400);
        }

        const transport = sessions.get(sessionId);
        if (transport === undefined) {
          return c.json({ error: `No active session: ${sessionId}` }, 404);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawReq = (c.env as any)?.incoming as import('node:http').IncomingMessage | undefined;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawRes = (c.env as any)?.outgoing as import('node:http').ServerResponse | undefined;

        if (rawReq === undefined || rawRes === undefined) {
          return c.json({ error: 'SSE transport requires a Node.js HTTP server' }, 500);
        }

        await transport.handlePostMessage(rawReq, rawRes);

        return new Response(null, { status: 202 });
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Transport factory: stdio (standalone CLI process)
// ---------------------------------------------------------------------------

/**
 * Creates and connects a Lobster MCP server over stdio transport.
 * This is the entry point for CLI usage:
 *
 * ```ts
 * await createStdioServer(store);
 * ```
 *
 * The function resolves once the connection is established and the process
 * should keep running to serve requests.
 */
export async function createStdioServer(store: EngineStore): Promise<LobsterMCPServer> {
  const lobsterMcp = new LobsterMCPServer(store);
  const transport = new StdioServerTransport();
  await lobsterMcp.mcpServer.connect(transport);
  return lobsterMcp;
}

// ---------------------------------------------------------------------------
// EngineStore factory — creates a concrete in-memory store
// ---------------------------------------------------------------------------

/**
 * Creates a simple mutable in-memory EngineStore that satisfies the
 * EngineStore interface.  This is the default store used when no external
 * state management is provided.
 */
export function createEngineStore(
  initialBots: readonly BotRecord[] = [],
  initialScenes: readonly SceneRecord[] = [],
): EngineStore {
  const bots = new Map<string, BotRecord>(initialBots.map((b) => [b.id, b]));
  const scenes = new Map<string, SceneRecord>(initialScenes.map((s) => [s.id, s]));

  return {
    get bots(): ReadonlyMap<string, BotRecord> {
      return bots;
    },
    get scenes(): ReadonlyMap<string, SceneRecord> {
      return scenes;
    },
    addBot(bot: BotRecord): void {
      bots.set(bot.id, bot);
    },
    addScene(scene: SceneRecord): void {
      scenes.set(scene.id, scene);
    },
    updateScene(scene: SceneRecord): void {
      scenes.set(scene.id, scene);
    },
  };
}
