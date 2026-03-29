# Lobster Engine

[![npm version](https://img.shields.io/npm/v/@lobster-engine/core)](https://www.npmjs.com/org/lobster-engine)
[![Node.js version](https://img.shields.io/badge/node-%3E%3D20.0-green)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI/CD](https://img.shields.io/github/actions/workflow/status/openclaw/lobster-engine/test.yml?branch=main)](https://github.com/openclaw/lobster-engine)

## What is Lobster Engine?

Lobster Engine is a pluggable AI bot runtime for building scalable conversational agents. It powers games, customer service bots, and automation workflows by combining a modular architecture with NATS-based message distribution and pluggable AI adapters.

The engine handles the complete bot lifecycle — from turn-based event processing to multi-adapter AI selection to persistent state management — allowing you to focus on game logic and scene design.

## Features

- **Pluggable Scene Plugins** — Drop-in game and service modules (werewolf, codenames, debate, custom logic)
- **Multi-AI Adapter Support** — Switch between OpenClaw, Coze, Dify, or any OpenAI-compatible LLM without code changes
- **3-Tier Storage** — Hot (Redis) → Warm (SQLite) → Cold (PostgreSQL) for flexible performance-cost tradeoffs
- **Real-Time Gateway** — REST, WebSocket, Server-Sent Events (SSE), and Model Context Protocol (MCP) endpoints in a single service
- **NATS-Distributed Workers** — Horizontally scalable worker pool via JetStream for processing 1M+ concurrent bots
- **Type-Safe TypeScript** — Full type safety with zero `any`, strict mode, and >80% test coverage
- **Observable** — Prometheus metrics, structured logging (Pino), and Grafana dashboards included
- **Monorepo Ready** — Turborepo + pnpm workspace for fast builds and dependency management

## Quick Start

Install the core package and define a minimal engine:

```bash
npm install @lobster-engine/core
```

Create a scene plugin and adapter, then start processing events:

```typescript
import { LobsterEngine, MemoryProvider, type ScenePlugin, type AIPlatformAdapter } from '@lobster-engine/core';

// Define your scene plugin
const myScene: ScenePlugin = {
  name: 'my-scene',
  sceneType: 'game',
  buildPrompt: (event) => [{
    role: 'system',
    content: 'You are a helpful game bot.'
  }],
  parseAction: (response) => ({ type: 'speak', content: response, target: undefined, metadata: {} }),
  validateAction: (action) => ({ valid: action.type === 'speak' }),
  getDefaultAction: () => ({ type: 'pass', content: '', target: undefined, metadata: {} }),
  formatEvent: (event) => `${event.type} at ${new Date(event.timestamp).toISOString()}`
};

// Define your AI adapter
const myAdapter: AIPlatformAdapter = {
  name: 'my-adapter',
  platform: 'openai',
  async connect() { /* authenticate */ },
  async disconnect() { /* cleanup */ },
  async chat(messages) { return { content: 'Hello!', finishReason: 'stop' }; },
  getCapabilities: () => ({ streaming: false, functionCalling: false, vision: false, maxContextLength: 4096 })
};

// Create and start the engine
const engine = new LobsterEngine({
  name: 'my-bot-engine',
  storage: new MemoryProvider(),
}).use(myScene).registerAdapter(myAdapter);

await engine.start();

// Process events
const result = await engine.handleTurnEvent({
  id: 'evt-1',
  botId: 'bot-1',
  sceneId: 'game:room-1',
  type: 'discuss',
  phase: 'day',
  data: { message: 'What do you think?' },
  timestamp: Date.now()
});

console.log(result);
```

Run with:
```bash
npx tsx examples/basic.ts
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    API Gateway                          │
│  (REST / WebSocket / SSE / MCP on port 3000)           │
└────────┬────────────────────────────────┬───────────────┘
         │                                │
         │ Publish                        │ Subscribe
         ↓                                ↓
┌─────────────────────────────────────────────────────────┐
│            NATS JetStream (Message Bus)                 │
│         (Topics: bot.*, scene.*, worker.*)              │
└────────┬────────────────────────────────┬───────────────┘
         │                                │
         │ Subscribe                      │ Publish
         ↓                                ↓
┌─────────────────────────────────────────────────────────┐
│         Worker Pool (Horizontally Scalable)             │
│   Process turns via Scene Plugins + AI Adapters        │
│     (Redis hot state ← → PostgreSQL cold state)        │
└─────────────────────────────────────────────────────────┘
```

## Packages

| Package | NPM | Description |
|---------|-----|-------------|
| `@lobster-engine/core` | [npm](https://www.npmjs.com/package/@lobster-engine/core) | Core engine: types, interfaces, LobsterEngine class, event emitter |
| `@lobster-engine/cli` | [npm](https://www.npmjs.com/package/@lobster-engine/cli) | CLI tool: `lobster-engine` command for local development and debugging |
| `@lobster-engine/gateway` | [npm](https://www.npmjs.com/package/@lobster-engine/gateway) | API Gateway: REST/WebSocket/SSE/MCP endpoints (Hono + NATS) |
| `@lobster-engine/storage-sqlite` | [npm](https://www.npmjs.com/package/@lobster-engine/storage-sqlite) | SQLite storage provider (default, zero dependencies) |
| `@lobster-engine/storage-redis` | [npm](https://www.npmjs.com/package/@lobster-engine/storage-redis) | Redis storage provider (production hot state) |
| `@lobster-engine/storage-postgres` | [npm](https://www.npmjs.com/package/@lobster-engine/storage-postgres) | PostgreSQL storage provider (cold data, analytics) |
| `@lobster-engine/adapter-openclaw` | [npm](https://www.npmjs.com/package/@lobster-engine/adapter-openclaw) | OpenClaw AI platform adapter |
| `@lobster-engine/adapter-coze` | [npm](https://www.npmjs.com/package/@lobster-engine/adapter-coze) | Coze AI platform adapter |
| `@lobster-engine/adapter-dify` | [npm](https://www.npmjs.com/package/@lobster-engine/adapter-dify) | Dify AI platform adapter |
| `@lobster-engine/adapter-direct` | [npm](https://www.npmjs.com/package/@lobster-engine/adapter-direct) | Direct LLM adapter (OpenAI-compatible) |
| `@lobster-engine/scene-werewolf` | [npm](https://www.npmjs.com/package/@lobster-engine/scene-werewolf) | Werewolf game scene plugin |

## Configuration

Environment variables control storage, adapters, logging, and NATS connectivity:

| Variable | Default | Description | Example |
|----------|---------|-------------|---------|
| `NODE_ENV` | `development` | Execution environment | `production`, `development`, `test` |
| `LOG_LEVEL` | `info` | Minimum log level | `debug`, `info`, `warn`, `error` |
| `NATS_URL` | `nats://localhost:4222` | NATS server URL | `nats://nats.example.com:4222` |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string | `redis://redis.example.com:6379` |
| `DATABASE_URL` | `:memory:` | SQLite database file or `:memory:` | `/data/lobster.db` |
| `POSTGRES_URL` | — | PostgreSQL connection string | `postgresql://user:pass@db:5432/lobster` |
| `GATEWAY_PORT` | `3000` | HTTP server port | `8080` |
| `ADAPTER_TIMEOUT` | `30000` | AI adapter response timeout (ms) | `60000` |
| `ADAPTER_MAX_QUEUE` | `1000` | Max queued requests per adapter | `5000` |

## Usage Examples

### SDK Mode — Embed in Your Application

```typescript
import { LobsterEngine, MemoryProvider } from '@lobster-engine/core';
import { WerewolfScene } from '@lobster-engine/scene-werewolf';
import { OpenClawAdapter } from '@lobster-engine/adapter-openclaw';

const engine = new LobsterEngine({
  name: 'my-app-engine',
  storage: new MemoryProvider(),
  plugins: [new WerewolfScene()],
  adapters: [new OpenClawAdapter({ apiKey: process.env.OPENCLAW_API_KEY })],
});

await engine.start();

// Listen to events
engine.on('scene:action', (botId, sceneId, result) => {
  console.log(`Bot ${botId} acted: ${result.action.type}`);
});

// Inject events
const result = await engine.handleTurnEvent(/* ... */);

await engine.stop();
```

### CLI Mode — Local Development

```bash
# Install the CLI
npm install -g @lobster-engine/cli

# Create a local engine with mock scene and adapter
lobster-engine init my-bot

# Run the engine
cd my-bot && lobster-engine dev
```

### Docker Mode — Full Stack with Infrastructure

```bash
# Clone the repository
git clone https://github.com/openclaw/lobster-engine.git
cd lobster-engine

# Start all services (Gateway, Workers, NATS, Redis, Prometheus, Grafana)
docker compose up

# Gateway runs on http://localhost:3000
# Grafana dashboard on http://localhost:3001 (admin/admin)
# Prometheus on http://localhost:9090
```

## Scene Plugins

A scene plugin encapsulates the logic for one scene type (game, service, workflow). It converts incoming turn events into AI prompts, parses AI responses into structured actions, and validates those actions.

### Scene Plugin Interface

```typescript
interface ScenePlugin {
  readonly name: string;
  readonly version: string;
  readonly sceneType: string; // e.g., 'werewolf', 'customer-service'

  initialize?(engine: LobsterEngine): Promise<void>; // Optional setup

  buildPrompt(event: TurnEvent, context: SceneContext): ChatMessage[];
  parseAction(response: string, context: SceneContext): ActionSpec;
  validateAction(action: ActionSpec, context: SceneContext): ActionValidationResult;
  getDefaultAction(event: TurnEvent, context: SceneContext): ActionSpec;
  formatEvent(event: TurnEvent, perspective?: string): string;
}
```

### Creating a Custom Scene Plugin

```typescript
import { ScenePlugin, SceneContext, ActionSpec, TurnEvent, ChatMessage, ActionValidationResult } from '@lobster-engine/core';

const myCustomScene: ScenePlugin = {
  name: 'my-debate-scene',
  version: '1.0.0',
  sceneType: 'debate',

  buildPrompt(event: TurnEvent, context: SceneContext): ChatMessage[] {
    return [
      {
        role: 'system',
        content: `You are a thoughtful debater. The current topic is: ${event.data.topic}.
Return a JSON object: { "type": "argue" | "concede", "content": "your statement", "target": "opposing_bot_id" }`
      },
      {
        role: 'user',
        content: `Round ${event.data.round}: ${event.data.prompt}`
      }
    ];
  },

  parseAction(response: string, _context: SceneContext): ActionSpec {
    const parsed = JSON.parse(response);
    return {
      type: parsed.type,
      content: parsed.content,
      target: parsed.target,
      metadata: { tokens: response.length }
    };
  },

  validateAction(action: ActionSpec, _context: SceneContext): ActionValidationResult {
    if (!['argue', 'concede'].includes(action.type)) {
      return { valid: false, reason: 'Unknown action type' };
    }
    return { valid: true };
  },

  getDefaultAction(_event: TurnEvent, _context: SceneContext): ActionSpec {
    return { type: 'concede', content: 'I defer to the other party.', target: undefined, metadata: {} };
  },

  formatEvent(event: TurnEvent, perspective?: string): string {
    const who = perspective ? `[${perspective}] ` : '';
    return `${who}${event.type}: ${event.data.statement}`;
  }
};

export default myCustomScene;
```

Register it with the engine:

```typescript
const engine = new LobsterEngine({ name: 'debate-engine' })
  .use(myCustomScene);
```

## AI Adapters

An AI adapter connects to an external AI platform (OpenClaw, Coze, Dify, OpenAI) and translates turn-based conversations into LLM requests and responses.

### Supported Adapters

| Adapter | Platform | Setup | Streaming | Function Calling | Vision |
|---------|----------|-------|-----------|------------------|--------|
| openclaw | OpenClaw | API key | Yes | Yes | Yes |
| coze | Coze | API key | Yes | Yes | No |
| dify | Dify | API key + Workflow ID | Yes | No | No |
| direct | OpenAI-compatible | API key | Yes | Yes | Yes |

### Adapter Interface

```typescript
interface AIPlatformAdapter {
  readonly name: string;
  readonly platform: string;

  detect(): Promise<boolean>; // Auto-detect configuration
  connect(): Promise<void>; // Authenticate and initialize
  disconnect(): Promise<void>; // Cleanup

  chat(messages: readonly ChatMessage[]): Promise<ChatResponse>;
  getCapabilities(): AdapterCapabilities;
}
```

### Adding a Custom Adapter

```typescript
import { AIPlatformAdapter, ChatMessage, ChatResponse, AdapterCapabilities } from '@lobster-engine/core';

const myCustomAdapter: AIPlatformAdapter = {
  name: 'my-llm-adapter',
  platform: 'my-platform',

  async detect(): Promise<boolean> {
    return Boolean(process.env.MY_LLM_API_KEY);
  },

  async connect(): Promise<void> {
    const apiKey = process.env.MY_LLM_API_KEY;
    if (!apiKey) throw new Error('MY_LLM_API_KEY not set');
    // Validate credentials
  },

  async disconnect(): Promise<void> {
    // Cleanup
  },

  async chat(messages: readonly ChatMessage[]): Promise<ChatResponse> {
    const response = await fetch('https://api.my-platform.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MY_LLM_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ messages, model: 'gpt-4' })
    });

    const data = await response.json();
    return {
      content: data.choices[0].message.content,
      finishReason: data.choices[0].finish_reason,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens
      }
    };
  },

  getCapabilities(): AdapterCapabilities {
    return {
      streaming: true,
      functionCalling: true,
      vision: false,
      maxContextLength: 8192
    };
  }
};

export default myCustomAdapter;
```

Register it with the engine:

```typescript
const engine = new LobsterEngine({ name: 'my-engine' })
  .registerAdapter(myCustomAdapter);
```

## Storage Providers

Choose a storage tier based on your performance and cost requirements.

| Provider | Speed | Persistence | Use Case |
|----------|-------|-------------|----------|
| MemoryProvider | Fastest | No | Development, testing |
| SQLite | Fast | Yes (file) | Single-server production |
| Redis | Very fast | Optional (RDB/AOF) | Hot state, multi-server |
| PostgreSQL | Moderate | Yes (ACID) | Cold storage, analytics |

Example with Redis (production):

```typescript
import { LobsterEngine } from '@lobster-engine/core';
import { RedisStorageProvider } from '@lobster-engine/storage-redis';

const storage = new RedisStorageProvider({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

const engine = new LobsterEngine({
  name: 'production-engine',
  storage
});

await engine.start();
```

## API Reference

The Gateway exposes multiple endpoints for interacting with the engine:

### REST API

```bash
# Create a bot session
curl -X POST http://localhost:3000/api/bots \
  -H "Content-Type: application/json" \
  -d '{
    "botId": "bot-1",
    "platform": "discord",
    "metadata": { "username": "Alice" }
  }'

# Send a turn event
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "botId": "bot-1",
    "sceneId": "game:room-1",
    "type": "discuss",
    "phase": "day",
    "data": { "message": "Who is the impostor?" },
    "timestamp": '$(date +%s)000'
  }'

# Get bot state
curl http://localhost:3000/api/bots/bot-1
```

### WebSocket

```javascript
const ws = new WebSocket('ws://localhost:3000/ws');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'subscribe',
    channels: ['bot.bot-1', 'scene.game:room-1']
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
};
```

### Server-Sent Events (SSE)

```javascript
const eventSource = new EventSource('http://localhost:3000/events?botId=bot-1');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Event:', data);
};
```

For complete API documentation, see [OpenAPI spec](./docs/api.yaml).

## Development

### Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Lint all packages
pnpm lint

# Auto-fix linting issues
pnpm lint:fix

# Type-check all packages
pnpm typecheck

# Format code
pnpm format

# Clean build artifacts
pnpm clean
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test -- --watch

# Run tests for a specific package
pnpm test -- packages/core

# Generate coverage report
pnpm test:coverage
```

### Running the Example

```bash
# Build all packages first
pnpm build

# Run the basic example
npx tsx --tsconfig examples/tsconfig.json examples/basic.ts
```

### Local Development with Docker Compose

```bash
# Start all services (including hot-reload for code changes)
docker compose -f docker-compose.yml up

# View logs
docker compose logs -f gateway worker

# Scale workers
docker compose up --scale worker=4

# Stop all services
docker compose down
```

## Contributing

We welcome contributions. Please follow these guidelines:

1. **Fork and clone** the repository
2. **Create a feature branch**: `git checkout -b feat/my-feature`
3. **Write tests first** — aim for 80%+ coverage
4. **Follow the code style** — run `pnpm lint:fix` and `pnpm format`
5. **Add documentation** — update README and relevant docs
6. **Submit a pull request** — include a clear description of changes

### Code Quality

- All files must have >80% test coverage
- No `any` types — use `unknown` and narrow safely
- Immutable patterns only — no direct mutations
- Max 400 lines per file, 800 absolute maximum
- TypeScript strict mode enforced
- ESLint and Prettier required on commit

### Commit Message Format

```
<type>: <description>

<optional body explaining why this change was made>
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`

Example:
```
feat: add custom scene plugin support

Allows users to create scene plugins without modifying core code.
Plugins are registered via engine.use() and can be hot-loaded.
```

## License

MIT — See [LICENSE](LICENSE) for details.

## Support

- **Documentation**: https://lobster-engine.docs
- **Issue Tracker**: https://github.com/openclaw/lobster-engine/issues
- **Discussions**: https://github.com/openclaw/lobster-engine/discussions
- **Security**: See [SECURITY.md](SECURITY.md) for reporting vulnerabilities

## Roadmap

- Phase 1: Multi-adapter selection strategy (random, round-robin, weighted)
- Phase 2: Persistent state manager (cross-turn memory)
- Phase 3: Advanced observability (tracing, custom metrics)
- Phase 4: MCP plugin ecosystem and marketplace
- Phase 5: Multi-language support (Python SDK, Go SDK, Rust bindings)
