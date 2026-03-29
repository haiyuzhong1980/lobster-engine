#!/usr/bin/env tsx
/**
 * Proof Script 1: Engine Core Lifecycle
 *
 * Proves: LobsterEngine can start, register plugins/adapters/storage,
 * process turn events through the full pipeline, and shut down cleanly.
 *
 * Run: npx tsx scripts/proof-1-engine.ts
 */

import {
  LobsterEngine,
  MemoryProvider,
  type ScenePlugin,
  type SceneContext,
  type AIPlatformAdapter,
  type TurnEvent,
  type ActionSpec,
  type ChatMessage,
  type ChatResponse,
  type AdapterCapabilities,
} from '../packages/core/src/index.js';

// ---------------------------------------------------------------------------
// 1. Mock AI Adapter — simulates an LLM that returns werewolf actions
// ---------------------------------------------------------------------------

class ProofAdapter implements AIPlatformAdapter {
  readonly name = 'proof-adapter';
  private connected = false;
  private callCount = 0;

  async detect(): Promise<boolean> {
    return true;
  }

  async connect(): Promise<void> {
    this.connected = true;
    console.log('  [Adapter] Connected');
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    console.log('  [Adapter] Disconnected');
  }

  async chat(messages: readonly ChatMessage[]): Promise<ChatResponse> {
    this.callCount++;
    // Simulate different AI responses based on the prompt content
    const lastMsg = messages[messages.length - 1]?.content ?? '';

    let reply: string;
    if (lastMsg.includes('vote') || lastMsg.includes('kill')) {
      reply = 'I choose to target Player_2';
    } else if (lastMsg.includes('speech')) {
      reply = 'I believe Player_2 is suspicious based on their behavior last night.';
    } else if (lastMsg.includes('seer')) {
      reply = 'I want to check Player_3';
    } else {
      reply = 'I will pass this round.';
    }

    return {
      content: reply,
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
    };
  }

  async getCapabilities(): Promise<AdapterCapabilities> {
    return {
      streaming: false,
      functionCalling: false,
      vision: false,
      maxContextLength: 8192,
    };
  }

  getCallCount(): number {
    return this.callCount;
  }
}

// ---------------------------------------------------------------------------
// 2. Simple Scene Plugin — proves the plugin interface works
// ---------------------------------------------------------------------------

class ProofScene implements ScenePlugin {
  readonly name = 'proof-scene';
  readonly sceneType = 'proof';
  readonly version = '1.0.0';
  private turnCount = 0;

  async initialize(): Promise<void> {
    console.log('  [Scene] Initialized');
  }

  buildPrompt(event: TurnEvent, context: SceneContext): readonly ChatMessage[] {
    this.turnCount++;
    return [
      { role: 'system', content: `You are playing a proof game. Phase: ${event.phase}. Turn #${this.turnCount}.` },
      { role: 'user', content: `It is your turn. Phase is "${event.phase}". What do you do?` },
    ];
  }

  parseAction(response: string, event: TurnEvent): ActionSpec {
    // Extract a target from the response
    const targetMatch = response.match(/Player_(\d+)/);
    return {
      type: event.phase ?? 'action',
      content: response,
      target: targetMatch ? `player_${targetMatch[1]}` : undefined,
      metadata: { parsedAt: Date.now() },
    };
  }

  validateAction(action: ActionSpec, event: TurnEvent, context: SceneContext): { valid: boolean; reason?: string } {
    // Accept all actions for proof
    return { valid: true };
  }

  getDefaultAction(event: TurnEvent, context: SceneContext): ActionSpec {
    return {
      type: 'default',
      content: 'No action taken',
      target: undefined,
      metadata: { isDefault: true },
    };
  }

  formatEvent(event: TurnEvent): string {
    return `[${event.phase}] Turn event for bot ${event.botId}`;
  }
}

// ---------------------------------------------------------------------------
// 3. Main proof execution
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════');
  console.log('  PROOF 1: Lobster Engine Core Lifecycle');
  console.log('═══════════════════════════════════════════════════\n');

  const results: { test: string; pass: boolean; detail: string }[] = [];

  // --- Test 1: Engine construction ---
  console.log('[1/8] Creating engine...');
  const adapter = new ProofAdapter();
  const scene = new ProofScene();
  const storage = new MemoryProvider();

  const engine = new LobsterEngine({
    name: 'proof-engine',
    version: '1.0.0',
    storage,
    plugins: [scene],
    adapters: [adapter],
  });
  results.push({ test: 'Engine construction', pass: true, detail: 'LobsterEngine created with plugin + adapter + storage' });
  console.log('  ✓ Engine created\n');

  // --- Test 2: Engine start ---
  console.log('[2/8] Starting engine...');
  const events: string[] = [];
  engine.on('engine:ready', () => events.push('ready'));
  engine.on('engine:stopping', () => events.push('stopping'));
  engine.on('scene:turn', () => events.push('turn'));
  engine.on('scene:action', () => events.push('action'));
  engine.on('engine:error', (e) => events.push(`error:${e.error}`));

  await engine.start();
  const startPass = events.includes('ready');
  results.push({ test: 'Engine start', pass: startPass, detail: `Events: [${events.join(', ')}]` });
  console.log(`  ${startPass ? '✓' : '✗'} Engine started, engine:ready event emitted\n`);

  // --- Test 3: Storage connectivity ---
  console.log('[3/8] Testing storage...');
  await storage.set('proof:key', { hello: 'world' });
  const retrieved = await storage.get('proof:key') as { hello: string } | null;
  const storagePass = retrieved !== null && retrieved.hello === 'world';
  results.push({ test: 'Storage read/write', pass: storagePass, detail: `Stored and retrieved: ${JSON.stringify(retrieved)}` });
  console.log(`  ${storagePass ? '✓' : '✗'} Storage: write + read verified\n`);

  // --- Test 4: Scene registration ---
  console.log('[4/8] Verifying scene registration...');
  const registered = engine.scenes.get('proof-scene');
  const scenePass = registered !== undefined && registered.name === 'proof-scene';
  results.push({ test: 'Scene registration', pass: scenePass, detail: `Scene "${registered?.name}" found in registry` });
  console.log(`  ${scenePass ? '✓' : '✗'} Scene "proof-scene" registered\n`);

  // --- Test 5: Process turn event (night phase) ---
  console.log('[5/8] Processing turn event (night_kill)...');
  events.length = 0;
  const nightEvent: TurnEvent = {
    id: 'turn-001',
    botId: 'bot-alpha',
    sceneId: 'proof_room1',
    type: 'turn',
    phase: 'night_kill',
    data: { round: 1, players: ['player_1', 'player_2', 'player_3'] },
    timestamp: Date.now(),
  };

  const nightResult = await engine.handleTurnEvent(nightEvent);
  const nightPass = nightResult.success && nightResult.action.content.length > 0;
  results.push({
    test: 'Night turn processing',
    pass: nightPass,
    detail: `success=${nightResult.success}, action="${nightResult.action.content.slice(0, 60)}...", target=${nightResult.action.target}`,
  });
  console.log(`  ${nightPass ? '✓' : '✗'} Night turn: AI responded, action parsed`);
  console.log(`    Action: "${nightResult.action.content.slice(0, 60)}..."`);
  console.log(`    Target: ${nightResult.action.target}\n`);

  // --- Test 6: Process turn event (day speech) ---
  console.log('[6/8] Processing turn event (day_speech)...');
  const speechEvent: TurnEvent = {
    id: 'turn-002',
    botId: 'bot-alpha',
    sceneId: 'proof_room1',
    type: 'turn',
    phase: 'day_speech',
    data: { round: 1 },
    timestamp: Date.now(),
  };

  const speechResult = await engine.handleTurnEvent(speechEvent);
  const speechPass = speechResult.success && speechResult.action.content.includes('suspicious');
  results.push({
    test: 'Day speech processing',
    pass: speechPass,
    detail: `success=${speechResult.success}, content="${speechResult.action.content.slice(0, 60)}..."`,
  });
  console.log(`  ${speechPass ? '✓' : '✗'} Day speech: AI delivered speech`);
  console.log(`    Content: "${speechResult.action.content.slice(0, 60)}..."\n`);

  // --- Test 7: Verify adapter was called ---
  console.log('[7/8] Verifying AI adapter calls...');
  const adapterPass = adapter.getCallCount() === 2;
  results.push({ test: 'Adapter call count', pass: adapterPass, detail: `AI adapter called ${adapter.getCallCount()} times (expected 2)` });
  console.log(`  ${adapterPass ? '✓' : '✗'} Adapter called ${adapter.getCallCount()} times\n`);

  // --- Test 8: Graceful shutdown ---
  console.log('[8/8] Shutting down engine...');
  events.length = 0;
  await engine.stop();
  const stopPass = true; // If we get here without error, shutdown succeeded
  results.push({ test: 'Graceful shutdown', pass: stopPass, detail: 'Engine stopped without errors' });
  console.log(`  ${stopPass ? '✓' : '✗'} Engine shut down cleanly\n`);

  // --- Summary ---
  console.log('═══════════════════════════════════════════════════');
  console.log('  RESULTS');
  console.log('═══════════════════════════════════════════════════');
  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  for (const r of results) {
    console.log(`  ${r.pass ? '✓ PASS' : '✗ FAIL'} ${r.test}`);
    console.log(`         ${r.detail}`);
  }
  console.log('───────────────────────────────────────────────────');
  console.log(`  ${passed}/${total} passed${passed === total ? ' — ENGINE WORKS!' : ' — ISSUES FOUND'}`);
  console.log('═══════════════════════════════════════════════════\n');

  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
