// @lobster-engine/gateway — OpenAPI 3.1 spec module
//
// Generates a complete OpenAPI 3.1 specification for the Gateway REST API
// and exposes a Hono route handler that serves it as JSON.
//
// Usage:
//   import { registerOpenAPIRoute } from './openapi.js';
//   registerOpenAPIRoute(app);  // mounts GET /api/docs/openapi.json

import type { Hono } from 'hono';

// ---------------------------------------------------------------------------
// OpenAPI 3.1 type definitions (minimal, no external deps)
// ---------------------------------------------------------------------------

interface OpenAPIInfo {
  readonly title: string;
  readonly version: string;
  readonly description?: string;
  readonly contact?: { readonly name: string; readonly url: string };
  readonly license?: { readonly name: string; readonly url: string };
}

interface OpenAPIServer {
  readonly url: string;
  readonly description?: string;
}

interface OpenAPITag {
  readonly name: string;
  readonly description: string;
}

interface OpenAPISchemaObject {
  readonly type?: string;
  readonly format?: string;
  readonly description?: string;
  readonly enum?: readonly unknown[];
  readonly properties?: Readonly<Record<string, OpenAPISchemaObject>>;
  readonly items?: OpenAPISchemaObject;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean | OpenAPISchemaObject;
  readonly example?: unknown;
  readonly nullable?: boolean;
  readonly readOnly?: boolean;
  readonly default?: unknown;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minLength?: number;
}

type OpenAPISchema = OpenAPISchemaObject | { readonly $ref: string };

interface OpenAPIMediaType {
  readonly schema: OpenAPISchema;
  readonly example?: unknown;
}

interface OpenAPIRequestBody {
  readonly description?: string;
  readonly required: boolean;
  readonly content: Readonly<Record<string, OpenAPIMediaType>>;
}

interface OpenAPIParameter {
  readonly name: string;
  readonly in: 'path' | 'query' | 'header';
  readonly required: boolean;
  readonly description?: string;
  readonly schema: OpenAPISchemaObject;
}

interface OpenAPIResponseObject {
  readonly description: string;
  readonly content?: Readonly<Record<string, OpenAPIMediaType>>;
  readonly headers?: Readonly<Record<string, { readonly schema: OpenAPISchemaObject; readonly description?: string }>>;
}

interface OpenAPIOperation {
  readonly operationId: string;
  readonly summary: string;
  readonly description?: string;
  readonly tags: readonly string[];
  readonly parameters?: readonly OpenAPIParameter[];
  readonly requestBody?: OpenAPIRequestBody;
  readonly responses: Readonly<Record<string, OpenAPIResponseObject>>;
  readonly 'x-websocket'?: boolean;
  readonly 'x-sse'?: boolean;
}

type OpenAPIPathItem = Partial<Record<'get' | 'post' | 'patch' | 'delete' | 'put', OpenAPIOperation>>;

interface OpenAPIComponents {
  readonly schemas: Readonly<Record<string, OpenAPISchemaObject>>;
}

interface OpenAPISpec {
  readonly openapi: '3.1.0';
  readonly info: OpenAPIInfo;
  readonly servers: readonly OpenAPIServer[];
  readonly tags: readonly OpenAPITag[];
  readonly paths: Readonly<Record<string, OpenAPIPathItem>>;
  readonly components: OpenAPIComponents;
  readonly 'x-websocket-channels'?: Readonly<Record<string, { readonly description: string; readonly url: string; readonly messages: readonly { readonly name: string; readonly description: string; readonly payload: OpenAPISchema }[] }>>;
  readonly 'x-sse-channels'?: Readonly<Record<string, { readonly description: string; readonly url: string; readonly events: readonly { readonly name: string; readonly description: string; readonly payload: OpenAPISchema }[] }>>;
}

// ---------------------------------------------------------------------------
// Shared schema references
// ---------------------------------------------------------------------------

const ref = (name: string): { readonly $ref: string } => ({
  $ref: `#/components/schemas/${name}`,
});

// ---------------------------------------------------------------------------
// Component schemas
// ---------------------------------------------------------------------------

const schemas: Readonly<Record<string, OpenAPISchemaObject>> = {
  // --- Primitives & enums ---

  BotStatus: {
    type: 'string',
    enum: ['idle', 'active', 'error'],
    description: 'Lifecycle status of a registered bot.',
    example: 'idle',
  },

  SceneStatus: {
    type: 'string',
    enum: ['waiting', 'active', 'paused', 'ended'],
    description: 'Lifecycle status of a scene.',
    example: 'waiting',
  },

  // --- Core domain objects ---

  BotRecord: {
    type: 'object',
    required: ['id', 'platform', 'token', 'metadata', 'status', 'createdAt', 'updatedAt'],
    properties: {
      id: {
        type: 'string',
        format: 'uuid',
        readOnly: true,
        description: 'Unique bot identifier (UUID v4).',
        example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      },
      platform: {
        type: 'string',
        description: 'Platform identifier (e.g. "openclaw", "coze", "dify").',
        example: 'openclaw',
      },
      token: {
        type: 'string',
        description: 'Authentication token for the bot. Auto-generated when omitted.',
        example: 'tok_abc123',
      },
      metadata: {
        type: 'object',
        additionalProperties: true,
        description: 'Arbitrary key/value metadata attached to the bot.',
        example: { displayName: 'Alpha Bot', region: 'us-west' },
      },
      status: { $ref: '#/components/schemas/BotStatus' } as OpenAPISchemaObject,
      createdAt: {
        type: 'integer',
        format: 'int64',
        description: 'Unix epoch timestamp (ms) when the bot was registered.',
        example: 1711660800000,
      },
      updatedAt: {
        type: 'integer',
        format: 'int64',
        description: 'Unix epoch timestamp (ms) when the bot was last modified.',
        example: 1711664400000,
      },
    },
  },

  SceneRecord: {
    type: 'object',
    required: ['id', 'type', 'name', 'status', 'playerCount', 'botIds', 'config', 'createdAt', 'updatedAt'],
    properties: {
      id: {
        type: 'string',
        readOnly: true,
        description: 'Scene identifier. Auto-generated as "<type>:<uuid>" when not supplied.',
        example: 'werewolf:3fa85f64-5717-4562-b3fc-2c963f66afa6',
      },
      type: {
        type: 'string',
        description: 'Scene type key matching a registered ScenePlugin.',
        example: 'werewolf',
      },
      name: {
        type: 'string',
        description: 'Human-readable scene name.',
        example: 'Werewolf Room #1',
      },
      status: { $ref: '#/components/schemas/SceneStatus' } as OpenAPISchemaObject,
      playerCount: {
        type: 'integer',
        minimum: 0,
        description: 'Current number of bots joined to the scene.',
        example: 3,
      },
      botIds: {
        type: 'array',
        items: { type: 'string', format: 'uuid' },
        description: 'List of bot IDs currently joined to the scene.',
        example: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'],
      },
      config: {
        type: 'object',
        additionalProperties: true,
        description: 'Scene-specific configuration passed at join time.',
        example: { maxPlayers: 8, allowSpectators: false },
      },
      createdAt: {
        type: 'integer',
        format: 'int64',
        description: 'Unix epoch timestamp (ms) when the scene was created.',
        example: 1711660800000,
      },
      updatedAt: {
        type: 'integer',
        format: 'int64',
        description: 'Unix epoch timestamp (ms) when the scene was last modified.',
        example: 1711664400000,
      },
    },
  },

  // --- Request bodies ---

  RegisterBotRequest: {
    type: 'object',
    required: ['platform'],
    properties: {
      platform: {
        type: 'string',
        description: 'Target AI platform identifier.',
        example: 'openclaw',
      },
      token: {
        type: 'string',
        description: 'Custom bot token. A UUID is auto-generated when omitted.',
        example: 'tok_custom_abc123',
      },
      metadata: {
        type: 'object',
        additionalProperties: true,
        description: 'Arbitrary metadata to store with the bot.',
        example: { displayName: 'My Bot' },
      },
    },
  },

  UpdateBotRequest: {
    type: 'object',
    description: 'All fields are optional — only supplied fields are updated.',
    properties: {
      platform: {
        type: 'string',
        description: 'New platform identifier.',
        example: 'coze',
      },
      status: { $ref: '#/components/schemas/BotStatus' } as OpenAPISchemaObject,
      metadata: {
        type: 'object',
        additionalProperties: true,
        description: 'Replacement metadata object (full replace, not merge).',
        example: { displayName: 'Updated Bot' },
      },
    },
  },

  JoinSceneRequest: {
    type: 'object',
    required: ['botId', 'sceneType'],
    properties: {
      botId: {
        type: 'string',
        format: 'uuid',
        description: 'ID of the bot that should join the scene.',
        example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      },
      sceneType: {
        type: 'string',
        description: 'Scene type key (must match a registered ScenePlugin).',
        example: 'werewolf',
      },
      sceneId: {
        type: 'string',
        description: 'Explicit scene ID to join. A new scene is created when omitted.',
        example: 'werewolf:3fa85f64-5717-4562-b3fc-2c963f66afa6',
      },
      sceneName: {
        type: 'string',
        description: 'Human-readable scene name (defaults to sceneType).',
        example: 'Werewolf Room #1',
      },
      config: {
        type: 'object',
        additionalProperties: true,
        description: 'Scene-specific configuration object.',
        example: { maxPlayers: 8 },
      },
    },
  },

  LeaveSceneRequest: {
    type: 'object',
    required: ['botId', 'sceneId'],
    properties: {
      botId: {
        type: 'string',
        format: 'uuid',
        description: 'ID of the bot that should leave the scene.',
        example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      },
      sceneId: {
        type: 'string',
        description: 'ID of the scene to leave.',
        example: 'werewolf:3fa85f64-5717-4562-b3fc-2c963f66afa6',
      },
    },
  },

  SubmitActionRequest: {
    type: 'object',
    required: ['botId', 'type'],
    properties: {
      botId: {
        type: 'string',
        format: 'uuid',
        description: 'ID of the bot submitting the action. Must be a scene member.',
        example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      },
      type: {
        type: 'string',
        description: 'Action type string (game/scene-specific).',
        example: 'vote',
      },
      content: {
        type: 'string',
        description: 'Action payload content.',
        example: 'I vote to eliminate player A.',
        default: '',
      },
      target: {
        type: 'string',
        description: 'Target entity for the action (optional).',
        example: 'bot-id-target',
        nullable: true,
      },
    },
  },

  // --- Action result ---

  ActionResult: {
    type: 'object',
    required: ['sceneId', 'botId', 'type', 'content', 'timestamp'],
    properties: {
      sceneId: {
        type: 'string',
        description: 'Scene in which the action was submitted.',
        example: 'werewolf:3fa85f64-5717-4562-b3fc-2c963f66afa6',
      },
      botId: {
        type: 'string',
        format: 'uuid',
        description: 'Bot that submitted the action.',
        example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      },
      type: {
        type: 'string',
        description: 'Action type as submitted.',
        example: 'vote',
      },
      content: {
        type: 'string',
        description: 'Action content as submitted.',
        example: 'I vote to eliminate player A.',
      },
      target: {
        type: 'string',
        description: 'Target entity if specified.',
        example: 'bot-id-target',
        nullable: true,
      },
      timestamp: {
        type: 'integer',
        format: 'int64',
        description: 'Unix epoch timestamp (ms) when the action was processed.',
        example: 1711664400000,
      },
    },
  },

  // --- API response envelopes ---

  ErrorResponse: {
    type: 'object',
    required: ['success', 'error'],
    properties: {
      success: { type: 'boolean', example: false },
      error: {
        type: 'string',
        description: 'Human-readable error description.',
        example: 'Bot "abc" not found',
      },
    },
  },

  PaginationMeta: {
    type: 'object',
    required: ['total', 'page', 'limit'],
    properties: {
      total: {
        type: 'integer',
        minimum: 0,
        description: 'Total number of matching records.',
        example: 42,
      },
      page: {
        type: 'integer',
        minimum: 1,
        description: 'Current page number (1-based).',
        example: 1,
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        description: 'Maximum number of records per page.',
        example: 20,
      },
    },
  },

  // --- Status & Metrics ---

  StatusResponse: {
    type: 'object',
    required: ['botsCount', 'scenesCount', 'uptime'],
    properties: {
      botsCount: {
        type: 'integer',
        minimum: 0,
        description: 'Number of bots currently registered.',
        example: 12,
      },
      scenesCount: {
        type: 'integer',
        minimum: 0,
        description: 'Number of scenes currently active.',
        example: 3,
      },
      uptime: {
        type: 'number',
        format: 'float',
        description: 'Process uptime in seconds.',
        example: 3600.5,
      },
    },
  },

  MetricsResponse: {
    type: 'object',
    required: ['bots', 'scenes', 'memory'],
    properties: {
      bots: {
        type: 'object',
        required: ['total', 'byStatus'],
        properties: {
          total: { type: 'integer', minimum: 0, example: 12 },
          byStatus: {
            type: 'object',
            additionalProperties: { type: 'integer', minimum: 0 },
            description: 'Count of bots by status key.',
            example: { idle: 8, active: 3, error: 1 },
          },
        },
      },
      scenes: {
        type: 'object',
        required: ['total', 'byStatus'],
        properties: {
          total: { type: 'integer', minimum: 0, example: 3 },
          byStatus: {
            type: 'object',
            additionalProperties: { type: 'integer', minimum: 0 },
            description: 'Count of scenes by status key.',
            example: { waiting: 1, active: 2 },
          },
        },
      },
      memory: {
        type: 'object',
        description: 'Node.js process.memoryUsage() snapshot.',
        required: ['rss', 'heapTotal', 'heapUsed', 'external', 'arrayBuffers'],
        properties: {
          rss: { type: 'integer', format: 'int64', example: 52428800 },
          heapTotal: { type: 'integer', format: 'int64', example: 34603008 },
          heapUsed: { type: 'integer', format: 'int64', example: 22528000 },
          external: { type: 'integer', format: 'int64', example: 1024000 },
          arrayBuffers: { type: 'integer', format: 'int64', example: 10240 },
        },
      },
    },
  },

  HealthResponse: {
    type: 'object',
    required: ['status', 'timestamp'],
    properties: {
      status: { type: 'string', example: 'ok' },
      timestamp: {
        type: 'integer',
        format: 'int64',
        description: 'Unix epoch timestamp (ms).',
        example: 1711664400000,
      },
    },
  },

  DeletedResponse: {
    type: 'object',
    required: ['deleted'],
    properties: {
      deleted: {
        type: 'string',
        format: 'uuid',
        description: 'ID of the deleted resource.',
        example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Reusable response builders
// ---------------------------------------------------------------------------

/** Wrap a schema reference in a 200 ApiResponse envelope. */
function successResponse(
  description: string,
  dataSchema: OpenAPISchema,
  withMeta = false,
): OpenAPIResponseObject {
  const dataProperty = dataSchema;
  const required: string[] = ['success', 'data'];
  const properties: Record<string, OpenAPISchema> = {
    success: { type: 'boolean', example: true } as OpenAPISchemaObject,
    data: dataProperty,
  };

  if (withMeta) {
    required.push('meta');
    properties['meta'] = ref('PaginationMeta');
  }

  return {
    description,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required,
          properties,
        } as OpenAPISchemaObject,
      },
    },
  };
}

/** Wrap an array schema reference in a 200 paginated ApiResponse envelope. */
function paginatedResponse(
  description: string,
  itemSchema: OpenAPISchema,
): OpenAPIResponseObject {
  return successResponse(description, { type: 'array', items: itemSchema } as OpenAPISchemaObject, true);
}

const errorResponses: Record<string, OpenAPIResponseObject> = {
  '400': {
    description: 'Bad Request — invalid JSON or missing required field.',
    content: {
      'application/json': { schema: ref('ErrorResponse') },
    },
  },
  '403': {
    description: 'Forbidden — bot is not a member of the requested scene.',
    content: {
      'application/json': { schema: ref('ErrorResponse') },
    },
  },
  '404': {
    description: 'Not Found — the requested resource does not exist.',
    content: {
      'application/json': { schema: ref('ErrorResponse') },
    },
  },
};

// ---------------------------------------------------------------------------
// Pagination query parameters
// ---------------------------------------------------------------------------

const paginationParameters: readonly OpenAPIParameter[] = [
  {
    name: 'page',
    in: 'query',
    required: false,
    description: 'Page number (1-based). Defaults to 1.',
    schema: { type: 'integer', minimum: 1, default: 1 },
  },
  {
    name: 'limit',
    in: 'query',
    required: false,
    description: 'Maximum records per page (1-100). Defaults to 20.',
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  },
];

// ---------------------------------------------------------------------------
// Path definitions
// ---------------------------------------------------------------------------

const paths: Readonly<Record<string, OpenAPIPathItem>> = {
  '/health': {
    get: {
      operationId: 'getHealth',
      summary: 'Health check',
      description: 'Returns gateway health status and current server timestamp.',
      tags: ['System'],
      responses: {
        '200': successResponse('Gateway is healthy.', ref('HealthResponse')),
      },
    },
  },

  '/api/v1/bots/register': {
    post: {
      operationId: 'registerBot',
      summary: 'Register a new bot',
      description:
        'Creates a new bot record in the gateway registry. If `token` is omitted a UUID is generated automatically.',
      tags: ['Bots'],
      requestBody: {
        description: 'Bot registration payload.',
        required: true,
        content: {
          'application/json': { schema: ref('RegisterBotRequest') },
        },
      },
      responses: {
        '201': successResponse('Bot registered successfully.', ref('BotRecord')),
        '400': errorResponses['400']!,
      },
    },
  },

  '/api/v1/bots': {
    get: {
      operationId: 'listBots',
      summary: 'List bots',
      description: 'Returns a paginated list of all registered bots.',
      tags: ['Bots'],
      parameters: [...paginationParameters],
      responses: {
        '200': paginatedResponse('Paginated list of bots.', ref('BotRecord')),
      },
    },
  },

  '/api/v1/bots/{id}': {
    get: {
      operationId: 'getBot',
      summary: 'Get a bot by ID',
      description: 'Returns the full bot record for the given UUID.',
      tags: ['Bots'],
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          description: 'Bot UUID.',
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      responses: {
        '200': successResponse('Bot found.', ref('BotRecord')),
        '404': errorResponses['404']!,
      },
    },

    patch: {
      operationId: 'updateBot',
      summary: 'Update a bot',
      description:
        'Performs a partial update on `platform`, `metadata`, and/or `status`. Only supplied fields are changed.',
      tags: ['Bots'],
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          description: 'Bot UUID.',
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      requestBody: {
        description: 'Fields to update.',
        required: true,
        content: {
          'application/json': { schema: ref('UpdateBotRequest') },
        },
      },
      responses: {
        '200': successResponse('Bot updated.', ref('BotRecord')),
        '400': errorResponses['400']!,
        '404': errorResponses['404']!,
      },
    },

    delete: {
      operationId: 'deleteBot',
      summary: 'Delete a bot',
      description:
        'Removes the bot record from the registry. Returns the deleted bot ID.',
      tags: ['Bots'],
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          description: 'Bot UUID.',
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      responses: {
        '200': successResponse('Bot deleted.', ref('DeletedResponse')),
        '404': errorResponses['404']!,
      },
    },
  },

  '/api/v1/scenes/join': {
    post: {
      operationId: 'joinScene',
      summary: 'Join a scene',
      description:
        'Adds a bot to an existing scene or creates a new scene of the requested type. ' +
        'Returns 201 when a new scene is created, 200 when the bot joins an existing one.',
      tags: ['Scenes'],
      requestBody: {
        description: 'Scene join payload.',
        required: true,
        content: {
          'application/json': { schema: ref('JoinSceneRequest') },
        },
      },
      responses: {
        '200': successResponse('Bot joined an existing scene.', ref('SceneRecord')),
        '201': successResponse('New scene created and bot joined.', ref('SceneRecord')),
        '400': errorResponses['400']!,
        '404': errorResponses['404']!,
      },
    },
  },

  '/api/v1/scenes/leave': {
    post: {
      operationId: 'leaveScene',
      summary: 'Leave a scene',
      description:
        'Removes a bot from a scene. When the last bot leaves the scene status transitions to `ended`.',
      tags: ['Scenes'],
      requestBody: {
        description: 'Scene leave payload.',
        required: true,
        content: {
          'application/json': { schema: ref('LeaveSceneRequest') },
        },
      },
      responses: {
        '200': successResponse('Bot left the scene successfully.', ref('SceneRecord')),
        '400': errorResponses['400']!,
        '404': errorResponses['404']!,
      },
    },
  },

  '/api/v1/scenes': {
    get: {
      operationId: 'listScenes',
      summary: 'List scenes',
      description: 'Returns a paginated list of all scenes.',
      tags: ['Scenes'],
      parameters: [...paginationParameters],
      responses: {
        '200': paginatedResponse('Paginated list of scenes.', ref('SceneRecord')),
      },
    },
  },

  '/api/v1/scenes/{id}': {
    get: {
      operationId: 'getScene',
      summary: 'Get a scene by ID',
      description: 'Returns the full scene record for the given scene ID.',
      tags: ['Scenes'],
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          description: 'Scene ID (e.g. "werewolf:uuid").',
          schema: { type: 'string' },
        },
      ],
      responses: {
        '200': successResponse('Scene found.', ref('SceneRecord')),
        '404': errorResponses['404']!,
      },
    },
  },

  '/api/v1/scenes/{id}/action': {
    post: {
      operationId: 'submitAction',
      summary: 'Submit a bot action',
      description:
        'Submits an action from a bot to its current scene. The bot must be a member of the scene.',
      tags: ['Scenes'],
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          description: 'Scene ID.',
          schema: { type: 'string' },
        },
      ],
      requestBody: {
        description: 'Action payload.',
        required: true,
        content: {
          'application/json': { schema: ref('SubmitActionRequest') },
        },
      },
      responses: {
        '200': successResponse('Action processed.', ref('ActionResult')),
        '400': errorResponses['400']!,
        '403': errorResponses['403']!,
        '404': errorResponses['404']!,
      },
    },
  },

  '/api/v1/status': {
    get: {
      operationId: 'getStatus',
      summary: 'System status',
      description: 'Returns a lightweight status snapshot: bot count, scene count, and process uptime.',
      tags: ['System'],
      responses: {
        '200': successResponse('Current system status.', ref('StatusResponse')),
      },
    },
  },

  '/api/v1/metrics': {
    get: {
      operationId: 'getMetrics',
      summary: 'Detailed metrics',
      description:
        'Returns structured JSON metrics including per-status bot/scene counts and Node.js memory usage.',
      tags: ['System'],
      responses: {
        '200': successResponse('Current metrics snapshot.', ref('MetricsResponse')),
      },
    },
  },

  '/api/docs/openapi.json': {
    get: {
      operationId: 'getOpenAPISpec',
      summary: 'OpenAPI specification',
      description: 'Returns this OpenAPI 3.1 specification as a JSON document.',
      tags: ['System'],
      responses: {
        '200': {
          description: 'OpenAPI 3.1 spec document.',
          content: {
            'application/json': {
              schema: { type: 'object', additionalProperties: true },
            },
          },
        },
      },
    },
  },

  '/metrics': {
    get: {
      operationId: 'getPrometheusMetrics',
      summary: 'Prometheus metrics scrape endpoint',
      description:
        'Returns all registered Prometheus metrics in the Prometheus text exposition format ' +
        '(content-type: text/plain; version=0.0.4). Suitable for direct scraping by a ' +
        'Prometheus server. Metrics include HTTP traffic, bot/scene lifecycle gauges, ' +
        'AI adapter call counters, worker pool state, storage operations, NATS messaging, ' +
        'and standard Node.js process metrics.',
      tags: ['System'],
      responses: {
        '200': {
          description: 'Prometheus text exposition output.',
          content: {
            'text/plain; version=0.0.4': {
              schema: {
                type: 'string',
                description: 'Prometheus metric families in text format.',
                example:
                  '# HELP lobster_http_requests_total Total HTTP requests received\n' +
                  '# TYPE lobster_http_requests_total counter\n' +
                  'lobster_http_requests_total{method="GET",path="/api/v1/bots",status="200"} 42\n',
              },
            },
          },
        },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// WebSocket and SSE extension documentation
// ---------------------------------------------------------------------------

const webSocketChannels = {
  '/ws': {
    description:
      'Full-duplex WebSocket connection for real-time engine events. ' +
      'Authenticate via `?token=<value>` query parameter. ' +
      'After connecting the server sends a `connected` message with the assigned `clientId`. ' +
      'Clients subscribe to scenes by sending `{"type":"subscribe","sceneId":"<id>"}`. ' +
      'The server forwards EngineEvents to all subscribed clients.',
    url: 'ws://{host}/ws',
    messages: [
      {
        name: 'connected',
        description: 'Sent by the server immediately after a successful connection.',
        payload: {
          $ref: '#/components/schemas/WsConnectedMessage',
        },
      },
      {
        name: 'subscribe',
        description: 'Sent by the client to subscribe to scene events.',
        payload: {
          $ref: '#/components/schemas/WsSubscribeMessage',
        },
      },
      {
        name: 'unsubscribe',
        description: 'Sent by the client to unsubscribe from scene events.',
        payload: {
          $ref: '#/components/schemas/WsUnsubscribeMessage',
        },
      },
      {
        name: 'event',
        description: 'An EngineEvent broadcast to subscribed clients.',
        payload: {
          $ref: '#/components/schemas/WsEventMessage',
        },
      },
      {
        name: 'ping',
        description: 'Heartbeat sent by the server every ~30 s. Client should respond with `pong`.',
        payload: {
          $ref: '#/components/schemas/WsPingMessage',
        },
      },
      {
        name: 'error',
        description: 'Sent by the server when a client message cannot be processed.',
        payload: {
          $ref: '#/components/schemas/WsErrorMessage',
        },
      },
    ],
  },
} as const;

const sseChannels = {
  '/events/{sceneId}': {
    description:
      'Server-Sent Events stream scoped to a single scene. ' +
      'Supports `Last-Event-ID` header for missed-event replay on reconnect. ' +
      'The server sends a `connected` event as the first frame, followed by a ' +
      '`retry:` hint. Heartbeat `:heartbeat` comments are sent every ~15 s to ' +
      'prevent proxy timeouts.',
    url: 'http://{host}/events/{sceneId}',
    events: [
      {
        name: 'connected',
        description: 'First event sent upon successful subscription.',
        payload: {
          $ref: '#/components/schemas/SseConnectedEvent',
        },
      },
      {
        name: 'engine-event',
        description: 'An EngineEvent forwarded to all listeners in the scene.',
        payload: {
          $ref: '#/components/schemas/SseEngineEvent',
        },
      },
    ],
  },
} as const;

// Additional schemas for WS/SSE messages
const wsSSESchemas: Readonly<Record<string, OpenAPISchemaObject>> = {
  WsConnectedMessage: {
    type: 'object',
    required: ['type', 'data', 'timestamp'],
    properties: {
      type: { type: 'string', example: 'connected' },
      data: {
        type: 'object',
        required: ['clientId'],
        properties: { clientId: { type: 'string', format: 'uuid' } },
      },
      timestamp: { type: 'integer', format: 'int64' },
    },
  },
  WsSubscribeMessage: {
    type: 'object',
    required: ['type', 'sceneId'],
    properties: {
      type: { type: 'string', example: 'subscribe' },
      sceneId: { type: 'string', example: 'werewolf:3fa85f64-5717-4562-b3fc-2c963f66afa6' },
    },
  },
  WsUnsubscribeMessage: {
    type: 'object',
    required: ['type', 'sceneId'],
    properties: {
      type: { type: 'string', example: 'unsubscribe' },
      sceneId: { type: 'string', example: 'werewolf:3fa85f64-5717-4562-b3fc-2c963f66afa6' },
    },
  },
  WsEventMessage: {
    type: 'object',
    required: ['type', 'data', 'timestamp'],
    properties: {
      type: { type: 'string', example: 'event' },
      data: {
        type: 'object',
        additionalProperties: true,
        description: 'An EngineEvent payload (discriminated by `data.type`).',
        example: {
          type: 'scene:joined',
          payload: { botId: 'uuid', sceneId: 'werewolf:uuid' },
        },
      },
      timestamp: { type: 'integer', format: 'int64' },
    },
  },
  WsPingMessage: {
    type: 'object',
    required: ['type', 'data', 'timestamp'],
    properties: {
      type: { type: 'string', example: 'ping' },
      data: { type: 'object' },
      timestamp: { type: 'integer', format: 'int64' },
    },
  },
  WsErrorMessage: {
    type: 'object',
    required: ['type', 'data', 'timestamp'],
    properties: {
      type: { type: 'string', example: 'error' },
      data: {
        type: 'object',
        required: ['code', 'message'],
        properties: {
          code: { type: 'string', example: 'INVALID_MESSAGE' },
          message: { type: 'string', example: 'Malformed JSON message' },
        },
      },
      timestamp: { type: 'integer', format: 'int64' },
    },
  },
  SseConnectedEvent: {
    type: 'object',
    required: ['type', 'payload'],
    properties: {
      type: { type: 'string', example: 'connected' },
      payload: {
        type: 'object',
        required: ['sceneId', 'clientId'],
        properties: {
          sceneId: { type: 'string' },
          clientId: { type: 'string', format: 'uuid' },
        },
      },
    },
  },
  SseEngineEvent: {
    type: 'object',
    required: ['type', 'payload'],
    properties: {
      type: {
        type: 'string',
        description: 'EngineEvent discriminant.',
        example: 'scene:turn',
        enum: [
          'bot:connected',
          'bot:disconnected',
          'bot:error',
          'scene:joined',
          'scene:left',
          'scene:turn',
          'scene:action',
          'scene:end',
          'engine:ready',
          'engine:stopping',
          'engine:error',
        ],
      },
      payload: {
        type: 'object',
        additionalProperties: true,
        description: 'Event-specific payload. Shape depends on `type`.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Spec assembly
// ---------------------------------------------------------------------------

/**
 * Generates and returns the complete OpenAPI 3.1 specification object for the
 * Lobster Engine Gateway REST API.
 *
 * The returned object is serialisable as JSON (no functions, no circular refs).
 */
export function generateOpenAPISpec(): OpenAPISpec {
  return {
    openapi: '3.1.0',

    info: {
      title: 'Lobster Engine Gateway API',
      version: '1.0.0',
      description:
        'REST API for the Lobster Engine Gateway. Provides bot management, scene orchestration, ' +
        'system status, and metrics endpoints. Real-time channels are documented under ' +
        '`x-websocket-channels` and `x-sse-channels`.',
      contact: {
        name: 'Lobster Engine',
        url: 'https://github.com/openclaw/lobster-engine',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },

    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Local development server',
      },
      {
        url: 'https://gateway.lobster.example.com',
        description: 'Production server',
      },
    ],

    tags: [
      { name: 'Bots', description: 'Bot registration and lifecycle management.' },
      { name: 'Scenes', description: 'Scene orchestration — join, leave, and submit actions.' },
      { name: 'System', description: 'Health, status, metrics, and API documentation.' },
    ],

    paths,

    components: {
      schemas: { ...schemas, ...wsSSESchemas },
    },

    'x-websocket-channels': webSocketChannels,
    'x-sse-channels': sseChannels,
  };
}

// ---------------------------------------------------------------------------
// Hono route integration
// ---------------------------------------------------------------------------

/**
 * Registers a `GET /api/docs/openapi.json` handler on the provided Hono app
 * that serves the generated OpenAPI 3.1 specification.
 *
 * Usage:
 * ```ts
 * import { registerOpenAPIRoute } from './openapi.js';
 *
 * const app = new Hono();
 * registerOpenAPIRoute(app);
 * ```
 */
export function registerOpenAPIRoute(app: Hono): void {
  const spec = generateOpenAPISpec();

  app.get('/api/docs/openapi.json', (c) => {
    return c.json(spec);
  });
}
