# Getting Started with Lobster Engine

This guide walks you through creating your first AI bot using Lobster Engine, from installation through processing your first turn event.

## Prerequisites

Before you begin, ensure you have:

- **Node.js 20 or later** — Check with `node --version`
- **pnpm 9.15 or later** — Install with `npm install -g pnpm`
- **Git** (optional, for cloning examples)
- **A terminal/command prompt**

## Step 1: Install the Core Package

Lobster Engine is published as a set of npm packages. Start by installing the core:

```bash
npm install @lobster-engine/core
```

Or with pnpm:

```bash
pnpm add @lobster-engine/core
```

Verify the installation:

```bash
npm ls @lobster-engine/core
```

## Step 2: Create Your First Bot

Create a new TypeScript file (or JavaScript with JSDoc types) for your bot:

```typescript
// bot.ts
import {
  LobsterEngine,
  MemoryProvider,
  type ScenePlugin,
  type AIPlatformAdapter,
  type TurnEvent,
  type SceneContext,
  type ActionSpec,
  type ChatMessage,
  type ChatResponse,
  type AdapterCapabilities,
  type ActionValidationResult
} from '@lobster-engine/core';

// Define a simple scene plugin
const simpleScene: ScenePlugin = {
  name: 'simple-game',
  version: '1.0.0',
  sceneType: 'simple',

  buildPrompt(event: TurnEvent, _context: SceneContext): ChatMessage[] {
    return [
      { role: 'system', content: 'You are a helpful game bot.' },
      { role: 'user', content: `Event: ${event.type}. Data: ${JSON.stringify(event.data)}` }
    ];
  },

  parseAction(response: string, _context: SceneContext): ActionSpec {
    return {
      type: 'speak',
      content: response,
      target: undefined,
      metadata: {}
    };
  },

  validateAction(action: ActionSpec, _context: SceneContext): ActionValidationResult {
    if (action.type !== 'speak') {
      return { valid: false, reason: 'Only speak actions are allowed' };
    }
    return { valid: true };
  },

  getDefaultAction(_event: TurnEvent, _context: SceneContext): ActionSpec {
    return { type: 'speak', content: 'I have nothing to say.', target: undefined, metadata: {} };
  },

  formatEvent(event: TurnEvent, perspective?: string): string {
    const prefix = perspective ? `[${perspective}] ` : '';
    return `${prefix}${event.type} at ${new Date(event.timestamp).toISOString()}`;
  }
};

// Define a mock adapter that doesn't require API keys
const mockAdapter: AIPlatformAdapter = {
  name: 'mock-adapter',
  platform: 'mock',

  async detect(): Promise<boolean> {
    return true;
  },

  async connect(): Promise<void> {
    console.log('Mock adapter connected');
  },

  async disconnect(): Promise<void> {
    console.log('Mock adapter disconnected');
  },

  async chat(messages: readonly ChatMessage[]): Promise<ChatResponse> {
    console.log(`Processing ${messages.length} messages`);
    return {
      content: 'This is a mock response from the AI.',
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
    };
  },

  getCapabilities(): AdapterCapabilities {
    return {
      streaming: false,
      functionCalling: false,
      vision: false,
      maxContextLength: 2048
    };
  }
};

// Create and run the engine
async function main(): Promise<void> {
  // Step 1: Instantiate the engine
  const engine = new LobsterEngine({
    name: 'my-first-bot',
    version: '1.0.0',
    storage: new MemoryProvider() // In-memory storage for development
  });

  // Step 2: Register the scene and adapter
  engine.use(simpleScene).registerAdapter(mockAdapter);

  // Step 3: Listen to events
  engine.on('engine:ready', () => {
    console.log('Engine is ready!');
  });

  engine.on('scene:turn', (botId, sceneId, event) => {
    console.log(`Turn event: ${botId} in ${sceneId} - ${event.type}`);
  });

  engine.on('scene:action', (botId, sceneId, result) => {
    console.log(`Action result: ${result.action.type} - Success: ${result.success}`);
  });

  engine.on('engine:error', (error) => {
    console.error('Engine error:', error.message);
  });

  // Step 4: Start the engine
  await engine.start();

  // Step 5: Create and handle a turn event
  const turnEvent: TurnEvent = {
    id: 'turn-001',
    botId: 'bot-alice',
    sceneId: 'simple:game-1',
    type: 'discuss',
    phase: 'day',
    data: { message: 'Hello bot!' },
    timestamp: Date.now()
  };

  const result = await engine.handleTurnEvent(turnEvent);

  console.log('\nTurn result:', {
    success: result.success,
    actionType: result.action.type,
    duration: `${result.duration}ms`
  });

  // Step 6: Stop the engine
  await engine.stop();
  console.log('Engine stopped.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
```

Run it with tsx:

```bash
npx tsx bot.ts
```

Expected output:

```
Mock adapter connected
Engine is ready!
Turn event: bot-alice in simple:game-1 - discuss
Action result: speak - Success: true

Turn result: {
  success: true,
  actionType: 'speak',
  duration: '2ms'
}
Engine stopped.
```

## Step 3: Add a Scene Plugin

Now let's create a dedicated scene plugin file that encapsulates game logic:

```typescript
// scenes/werewolf-scene.ts
import {
  ScenePlugin,
  type TurnEvent,
  type SceneContext,
  type ChatMessage,
  type ActionSpec,
  type ActionValidationResult
} from '@lobster-engine/core';

export const werewolfScene: ScenePlugin = {
  name: 'werewolf-game',
  version: '1.0.0',
  sceneType: 'werewolf',

  buildPrompt(event: TurnEvent, context: SceneContext): ChatMessage[] {
    const systemPrompt = `You are a player in a Werewolf game.
Your role: ${context.metadata?.role ?? 'unknown'}
Phase: ${event.phase}
Players alive: ${context.metadata?.playersAlive ?? 'unknown'}

Return a JSON action with: { "type": "vote" | "discuss" | "vote", "target": "bot-id", "content": "reason" }`;

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: event.data.prompt as string }
    ];
  },

  parseAction(response: string, _context: SceneContext): ActionSpec {
    try {
      const action = JSON.parse(response);
      return {
        type: action.type ?? 'discuss',
        content: action.content ?? '',
        target: action.target,
        metadata: { raw: response }
      };
    } catch {
      return { type: 'discuss', content: response, target: undefined, metadata: {} };
    }
  },

  validateAction(action: ActionSpec, _context: SceneContext): ActionValidationResult {
    const validTypes = ['vote', 'discuss'];
    if (!validTypes.includes(action.type)) {
      return { valid: false, reason: `Invalid action type: ${action.type}` };
    }
    if (action.type === 'vote' && !action.target) {
      return { valid: false, reason: 'Vote requires a target' };
    }
    return { valid: true };
  },

  getDefaultAction(event: TurnEvent, _context: SceneContext): ActionSpec {
    return {
      type: 'discuss',
      content: 'I think we should discuss more before deciding.',
      target: undefined,
      metadata: { isDefault: true }
    };
  },

  formatEvent(event: TurnEvent, perspective?: string): string {
    const who = perspective ? `[${perspective}] ` : '';
    return `${who}${event.phase.toUpperCase()}: ${event.data.prompt}`;
  }
};
```

Update your bot to use it:

```typescript
import { werewolfScene } from './scenes/werewolf-scene';

const engine = new LobsterEngine({
  name: 'werewolf-bot-engine',
  storage: new MemoryProvider(),
  plugins: [werewolfScene] // Register at construction
});

await engine.start();

// Now process werewolf-specific turns
const result = await engine.handleTurnEvent({
  id: 'turn-002',
  botId: 'bot-bob',
  sceneId: 'werewolf:room-5',
  type: 'vote',
  phase: 'day',
  data: {
    prompt: 'Who should be eliminated?',
    playersAlive: ['bot-alice', 'bot-bob', 'bot-carol']
  },
  timestamp: Date.now()
});
```

## Step 4: Choose an AI Adapter

Replace the mock adapter with a real one. Install your chosen adapter package:

### Option A: Direct LLM (OpenAI-compatible)

```bash
npm install @lobster-engine/adapter-direct
```

```typescript
import { DirectLLMAdapter } from '@lobster-engine/adapter-direct';

const adapter = new DirectLLMAdapter({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  model: 'gpt-4-turbo'
});

engine.registerAdapter(adapter);
```

### Option B: OpenClaw

```bash
npm install @lobster-engine/adapter-openclaw
```

```typescript
import { OpenClawAdapter } from '@lobster-engine/adapter-openclaw';

const adapter = new OpenClawAdapter({
  apiKey: process.env.OPENCLAW_API_KEY,
  workspaceId: process.env.OPENCLAW_WORKSPACE_ID
});

engine.registerAdapter(adapter);
```

### Option C: Coze

```bash
npm install @lobster-engine/adapter-coze
```

```typescript
import { CozeAdapter } from '@lobster-engine/adapter-coze';

const adapter = new CozeAdapter({
  apiKey: process.env.COZE_API_KEY,
  botId: process.env.COZE_BOT_ID
});

engine.registerAdapter(adapter);
```

Set the required environment variables before running:

```bash
export OPENAI_API_KEY="sk-..."
npx tsx bot.ts
```

## Step 5: Configure Storage

By default, `MemoryProvider` stores everything in RAM (lost on restart). For persistence, choose a storage provider:

### SQLite (Single-server, file-based)

```bash
npm install @lobster-engine/storage-sqlite
```

```typescript
import { SQLiteStorageProvider } from '@lobster-engine/storage-sqlite';

const storage = new SQLiteStorageProvider({
  database: './bot.db' // File path, or ':memory:' for in-memory
});

const engine = new LobsterEngine({
  name: 'my-bot',
  storage
});

await engine.start(); // Initializes the database
```

### Redis (Production, hot state)

```bash
npm install @lobster-engine/storage-redis
```

```typescript
import { RedisStorageProvider } from '@lobster-engine/storage-redis';

const storage = new RedisStorageProvider({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  keyPrefix: 'lobster:'
});

const engine = new LobsterEngine({
  name: 'my-bot',
  storage
});

await engine.start();
```

Ensure Redis is running:

```bash
# Using Docker
docker run -d -p 6379:6379 redis:7-alpine
```

### PostgreSQL (Cold storage, analytics)

```bash
npm install @lobster-engine/storage-postgres
```

```typescript
import { PostgresStorageProvider } from '@lobster-engine/storage-postgres';

const storage = new PostgresStorageProvider({
  connectionString: process.env.DATABASE_URL,
  // e.g., 'postgresql://user:password@localhost/lobster'
});

const engine = new LobsterEngine({
  name: 'my-bot',
  storage
});

await engine.start();
```

## Step 6: Start the Gateway

For multi-service deployments, use the Gateway to expose your engine via REST, WebSocket, and SSE:

```bash
npm install @lobster-engine/gateway
```

```typescript
// gateway.ts
import { createGateway } from '@lobster-engine/gateway';
import { LobsterEngine, MemoryProvider } from '@lobster-engine/core';

const engine = new LobsterEngine({
  name: 'my-bot-engine',
  storage: new MemoryProvider()
});

const gateway = await createGateway({
  engine,
  port: 3000,
  natsUrl: process.env.NATS_URL || 'nats://localhost:4222'
});

console.log('Gateway listening on http://localhost:3000');

// Graceful shutdown
process.on('SIGTERM', async () => {
  await gateway.close();
  await engine.stop();
  process.exit(0);
});
```

Run it:

```bash
npx tsx gateway.ts
```

Test the endpoints:

```bash
# REST: Send a turn event
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "botId": "bot-1",
    "sceneId": "werewolf:room-1",
    "type": "discuss",
    "phase": "day",
    "data": { "prompt": "Who is suspicious?" },
    "timestamp": '$(date +%s)000'
  }'

# WebSocket: Connect and subscribe
wscat -c ws://localhost:3000/ws
```

## Step 7: Connect via WebSocket or SSE

### WebSocket Example (Browser/Node.js)

```typescript
// client-ws.ts
const ws = new WebSocket('ws://localhost:3000/ws');

ws.onopen = () => {
  console.log('Connected');
  ws.send(JSON.stringify({
    type: 'subscribe',
    channels: ['bot.bot-1', 'scene.werewolf:*']
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
};

ws.onerror = (err) => {
  console.error('WebSocket error:', err);
};
```

### Server-Sent Events (SSE) Example

```typescript
// client-sse.ts
const eventSource = new EventSource(
  'http://localhost:3000/events?botId=bot-1&sceneId=werewolf:room-1'
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Event:', data);
};

eventSource.onerror = () => {
  console.error('SSE connection error');
  eventSource.close();
};
```

## Step 8: Deploy to Production

### Docker

Create a Dockerfile:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --prod
COPY . .
RUN pnpm build
CMD ["node", "dist/gateway.js"]
```

Build and run:

```bash
docker build -t my-bot-engine .
docker run -p 3000:3000 \
  -e NATS_URL=nats://nats:4222 \
  -e REDIS_URL=redis://redis:6379 \
  my-bot-engine
```

### Docker Compose

Use the provided `docker-compose.yml` to run the full stack (Gateway, Workers, NATS, Redis):

```bash
docker compose up -d
docker compose logs -f gateway
```

Access:
- **Gateway**: http://localhost:3000
- **Grafana**: http://localhost:3001 (admin/admin)
- **Prometheus**: http://localhost:9090

### Environment Variables

Set these before deployment:

```bash
export NODE_ENV=production
export LOG_LEVEL=info
export NATS_URL=nats://nats.example.com:4222
export REDIS_URL=redis://redis.example.com:6379
export OPENAI_API_KEY=sk-...
export GATEWAY_PORT=3000
```

## Next Steps

1. **Read the Full Documentation** — See [README.md](../README.md) for architecture, API reference, and advanced features
2. **Explore Examples** — Check `examples/` for real-world scene and adapter implementations
3. **Create Custom Scenes** — Build game or service logic tailored to your use case
4. **Monitor with Grafana** — Set up dashboards to track bot performance and errors
5. **Scale Horizontally** — Use NATS workers to process 1M+ concurrent bots
6. **Join the Community** — Contribute plugins, report issues, and share ideas

## Troubleshooting

### "Module not found" errors

Ensure all dependencies are installed:

```bash
pnpm install
```

### Mock adapter works, but real adapter fails

Check that environment variables are set:

```bash
echo $OPENAI_API_KEY
echo $OPENCLAW_API_KEY
```

### WebSocket connection refused

Ensure the Gateway is running on the correct port:

```bash
lsof -i :3000  # Check what's listening on port 3000
```

### Storage connection errors

Verify the database is running:

```bash
# Redis
redis-cli ping

# PostgreSQL
psql $DATABASE_URL -c "SELECT 1"

# SQLite (no service needed)
ls -la bot.db
```

## Getting Help

- **Documentation**: https://lobster-engine.docs
- **GitHub Issues**: https://github.com/openclaw/lobster-engine/issues
- **GitHub Discussions**: https://github.com/openclaw/lobster-engine/discussions
- **Email**: support@openclaw.ai

Good luck building amazing AI bots!
