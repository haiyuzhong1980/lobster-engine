/**
 * examples/basic.ts — LobsterEngine SDK usage example
 *
 * Run with:
 *   npx tsx --tsconfig examples/tsconfig.json examples/basic.ts
 *
 * This example walks through the full engine lifecycle:
 *   1. Create a LobsterEngine with MemoryProvider storage
 *   2. Register a MockScene plugin (inline)
 *   3. Register a MockAdapter (inline)
 *   4. Listen to engine events
 *   5. Start the engine
 *   6. Handle a turn event
 *   7. Stop the engine
 */

import {
  LobsterEngine,
  MemoryProvider,
  type ScenePlugin,
  type SceneContext,
  type AIPlatformAdapter,
  type ChatMessage,
  type ChatResponse,
  type AdapterCapabilities,
  type ActionSpec,
  type ActionValidationResult,
  type TurnEvent,
} from '@lobster-engine/core';

// ---------------------------------------------------------------------------
// Step 1: Define a MockScene plugin
//
// A ScenePlugin encapsulates the game or service logic for one scene type.
// It converts incoming TurnEvents into prompts, parses AI responses into
// structured actions, and validates those actions.
// ---------------------------------------------------------------------------

const mockScene: ScenePlugin = {
  name: 'mock-scene',
  version: '1.0.0',
  sceneType: 'mock',   // matches any sceneId that starts with "mock"

  initialize(engine: LobsterEngine): void {
    console.log(`[MockScene] Initialised — engine: ${engine.config.name}`);
  },

  buildPrompt(event: TurnEvent, _context: SceneContext): ChatMessage[] {
    return [
      { role: 'system', content: 'You are a helpful bot. Reply with a JSON action.' },
      { role: 'user',   content: `Event type: ${event.type}. Data: ${JSON.stringify(event.data)}` },
    ];
  },

  parseAction(response: string, _context: SceneContext): ActionSpec {
    // Try to parse JSON from the adapter response; fall back to a plain speak action.
    try {
      const parsed = JSON.parse(response) as Partial<ActionSpec>;
      return {
        type:     parsed.type     ?? 'speak',
        content:  parsed.content  ?? response,
        target:   parsed.target   ?? undefined,
        metadata: parsed.metadata ?? {},
      };
    } catch {
      return { type: 'speak', content: response, target: undefined, metadata: {} };
    }
  },

  validateAction(action: ActionSpec, _context: SceneContext): ActionValidationResult {
    const allowed = ['speak', 'vote', 'pass'];
    if (allowed.includes(action.type)) {
      return { valid: true };
    }
    return { valid: false, reason: `Unknown action type: "${action.type}"` };
  },

  getDefaultAction(_event: TurnEvent, _context: SceneContext): ActionSpec {
    return { type: 'pass', content: '', target: undefined, metadata: {} };
  },

  formatEvent(event: TurnEvent, perspective?: string): string {
    const prefix = perspective ? `[${perspective}] ` : '';
    return `${prefix}${event.type} @ ${new Date(event.timestamp).toISOString()}`;
  },
};

// ---------------------------------------------------------------------------
// Step 2: Define a MockAdapter
//
// An AIPlatformAdapter wraps an AI platform (OpenAI, Coze, Dify, etc.).
// This mock always returns a deterministic JSON action so the example runs
// without any network credentials.
// ---------------------------------------------------------------------------

const mockAdapter: AIPlatformAdapter = {
  name:     'mock-adapter',
  platform: 'mock',

  async detect(): Promise<boolean> {
    return true;
  },

  async connect(): Promise<void> {
    console.log('[MockAdapter] Connected');
  },

  async disconnect(): Promise<void> {
    console.log('[MockAdapter] Disconnected');
  },

  async chat(messages: readonly ChatMessage[]): Promise<ChatResponse> {
    console.log(`[MockAdapter] Received ${messages.length} message(s); returning mock action`);
    return {
      content:      JSON.stringify({ type: 'speak', content: 'Hello from the mock bot!' }),
      finishReason: 'stop',
      usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
    };
  },

  getCapabilities(): AdapterCapabilities {
    return { streaming: false, functionCalling: false, vision: false, maxContextLength: 4096 };
  },
};

// ---------------------------------------------------------------------------
// Step 3: Main — wire everything together and run a turn
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Create the engine with a MemoryProvider for in-process state storage.
  const engine = new LobsterEngine({
    name:    'example-engine',
    version: '1.0.0',
    storage: new MemoryProvider(),
  });

  // Register the scene plugin and adapter via fluent chaining.
  engine
    .use(mockScene)
    .registerAdapter(mockAdapter);

  // Step 4: Attach event listeners before starting so none are missed.
  engine.on('engine:ready',   ()                              => console.log('[Event] engine:ready'));
  engine.on('engine:stopping',()                              => console.log('[Event] engine:stopping'));
  engine.on('engine:error',   (err)                          => console.error('[Event] engine:error', err.message));
  engine.on('scene:turn',     (botId, sceneId, event)        => console.log(`[Event] scene:turn   — bot=${botId} scene=${sceneId} type=${event.type}`));
  engine.on('scene:action',   (botId, sceneId, result)       => console.log(`[Event] scene:action — bot=${botId} scene=${sceneId} success=${result.success} action=${result.action.type}`));

  // Step 5: Start the engine (connects storage, adapters, initialises plugins).
  await engine.start();

  // Step 6: Simulate an incoming turn event.
  const turn: TurnEvent = {
    id:        'turn-001',
    botId:     'bot-alice',
    sceneId:   'mock:room-1',   // matches sceneType "mock" by prefix
    type:      'discuss',
    phase:     'day',
    data:      { message: 'Who do you think is the impostor?' },
    timestamp: Date.now(),
  };

  const result = await engine.handleTurnEvent(turn);
  console.log('\nActionResult:', {
    success:  result.success,
    action:   result.action,
    duration: `${result.duration}ms`,
  });

  // Step 7: Stop the engine gracefully.
  await engine.stop();
  console.log('\nEngine stopped. Running:', engine.running);
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
