// @lobster-engine/gateway — LobsterMCPServer unit tests

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  LobsterMCPServer,
  createEngineStore,
  type EngineStore,
} from '../mcp.js';
import type { BotRecord, SceneRecord } from '../server.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeStore(
  bots: readonly BotRecord[] = [],
  scenes: readonly SceneRecord[] = [],
): EngineStore {
  return createEngineStore(bots, scenes);
}

function makeBot(overrides: Partial<BotRecord> = {}): BotRecord {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    platform: 'telegram',
    token: crypto.randomUUID(),
    metadata: {},
    status: 'idle',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeScene(
  botIds: readonly string[],
  overrides: Partial<SceneRecord> = {},
): SceneRecord {
  const now = Date.now();
  return {
    id: `werewolf:${crypto.randomUUID()}`,
    type: 'werewolf',
    name: 'Test scene',
    status: 'waiting',
    playerCount: botIds.length,
    botIds,
    config: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Connects a LobsterMCPServer to an in-memory MCP Client pair and returns
 * both so tests can call tools without network I/O.
 */
async function connectClient(store: EngineStore): Promise<{
  client: Client;
  lobsterMcp: LobsterMCPServer;
}> {
  const lobsterMcp = new LobsterMCPServer(store);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await lobsterMcp.mcpServer.connect(serverTransport);

  const client = new Client({ name: 'test-client', version: '0.0.1' });
  await client.connect(clientTransport);

  return { client, lobsterMcp };
}

// ---------------------------------------------------------------------------
// Tool registration — ensure all 8 tools are advertised
// ---------------------------------------------------------------------------

describe('LobsterMCPServer — tool registration', () => {
  it('advertises exactly 8 tools', async () => {
    const { client } = await connectClient(makeStore());
    const result = await client.listTools();
    expect(result.tools).toHaveLength(8);
    await client.close();
  });

  it('advertises the correct tool names', async () => {
    const { client } = await connectClient(makeStore());
    const result = await client.listTools();
    const names = result.tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        'lobster_bot_status',
        'lobster_create_scene',
        'lobster_engine_health',
        'lobster_list_bots',
        'lobster_list_scenes',
        'lobster_register_bot',
        'lobster_scene_status',
        'lobster_submit_action',
      ].sort(),
    );
    await client.close();
  });

  it('each tool has a non-empty description', async () => {
    const { client } = await connectClient(makeStore());
    const result = await client.listTools();
    for (const tool of result.tools) {
      expect(
        typeof tool.description === 'string' && tool.description.length > 0,
        `Tool "${tool.name}" should have a description`,
      ).toBe(true);
    }
    await client.close();
  });
});

// ---------------------------------------------------------------------------
// lobster_list_bots
// ---------------------------------------------------------------------------

describe('lobster_list_bots', () => {
  it('returns empty list when no bots are registered', async () => {
    const { client } = await connectClient(makeStore());
    const result = await client.callTool({ name: 'lobster_list_bots', arguments: {} });
    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(data.total).toBe(0);
    expect(data.bots).toEqual([]);
    await client.close();
  });

  it('returns all registered bots', async () => {
    const bot1 = makeBot({ platform: 'telegram' });
    const bot2 = makeBot({ platform: 'discord' });
    const { client } = await connectClient(makeStore([bot1, bot2]));
    const result = await client.callTool({ name: 'lobster_list_bots', arguments: {} });
    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(data.total).toBe(2);
    const ids = data.bots.map((b: { id: string }) => b.id).sort();
    expect(ids).toEqual([bot1.id, bot2.id].sort());
    await client.close();
  });

  it('includes platform and status for each bot', async () => {
    const bot = makeBot({ platform: 'coze', status: 'active' });
    const { client } = await connectClient(makeStore([bot]));
    const result = await client.callTool({ name: 'lobster_list_bots', arguments: {} });
    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(data.bots[0].platform).toBe('coze');
    expect(data.bots[0].status).toBe('active');
    await client.close();
  });
});

// ---------------------------------------------------------------------------
// lobster_register_bot
// ---------------------------------------------------------------------------

describe('lobster_register_bot', () => {
  it('creates a new bot and returns success', async () => {
    const store = makeStore();
    const { client } = await connectClient(store);
    const result = await client.callTool({
      name: 'lobster_register_bot',
      arguments: { name: 'TestBot', platform: 'telegram' },
    });
    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(data.success).toBe(true);
    expect(data.bot.platform).toBe('telegram');
    expect(typeof data.bot.id).toBe('string');
    await client.close();
  });

  it('adds the bot to the store', async () => {
    const store = makeStore();
    const { client } = await connectClient(store);
    await client.callTool({
      name: 'lobster_register_bot',
      arguments: { name: 'BotA', platform: 'discord' },
    });
    expect(store.bots.size).toBe(1);
    const [bot] = store.bots.values();
    expect(bot.platform).toBe('discord');
    await client.close();
  });

  it('attaches optional metadata when provided', async () => {
    const store = makeStore();
    const { client } = await connectClient(store);
    await client.callTool({
      name: 'lobster_register_bot',
      arguments: { name: 'BotMeta', platform: 'coze', metadata: { region: 'us-east' } },
    });
    const [bot] = store.bots.values();
    expect((bot.metadata as Record<string, unknown>)['region']).toBe('us-east');
    await client.close();
  });

  it('new bot has idle status by default', async () => {
    const store = makeStore();
    const { client } = await connectClient(store);
    const result = await client.callTool({
      name: 'lobster_register_bot',
      arguments: { name: 'IdleBot', platform: 'telegram' },
    });
    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(data.bot.status).toBe('idle');
    await client.close();
  });
});

// ---------------------------------------------------------------------------
// lobster_bot_status
// ---------------------------------------------------------------------------

describe('lobster_bot_status', () => {
  it('returns the bot record for a known bot', async () => {
    const bot = makeBot({ platform: 'telegram', status: 'active' });
    const { client } = await connectClient(makeStore([bot]));
    const result = await client.callTool({
      name: 'lobster_bot_status',
      arguments: { botId: bot.id },
    });
    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(data.id).toBe(bot.id);
    expect(data.status).toBe('active');
    await client.close();
  });

  it('returns isError=true for an unknown bot id', async () => {
    const { client } = await connectClient(makeStore());
    const result = await client.callTool({
      name: 'lobster_bot_status',
      arguments: { botId: 'nonexistent-id' },
    });
    expect(result.isError).toBe(true);
    await client.close();
  });
});

// ---------------------------------------------------------------------------
// lobster_list_scenes
// ---------------------------------------------------------------------------

describe('lobster_list_scenes', () => {
  it('returns empty list when no scenes exist', async () => {
    const { client } = await connectClient(makeStore());
    const result = await client.callTool({
      name: 'lobster_list_scenes',
      arguments: {},
    });
    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(data.total).toBe(0);
    await client.close();
  });

  it('returns all scenes when no filter is applied', async () => {
    const bot = makeBot();
    const scene1 = makeScene([bot.id], { status: 'active' });
    const scene2 = makeScene([bot.id], { status: 'ended' });
    const { client } = await connectClient(makeStore([bot], [scene1, scene2]));
    const result = await client.callTool({
      name: 'lobster_list_scenes',
      arguments: {},
    });
    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(data.total).toBe(2);
    await client.close();
  });

  it('filters scenes by status', async () => {
    const bot = makeBot();
    const active = makeScene([bot.id], { status: 'active' });
    const ended = makeScene([bot.id], { status: 'ended' });
    const { client } = await connectClient(makeStore([bot], [active, ended]));
    const result = await client.callTool({
      name: 'lobster_list_scenes',
      arguments: { status: 'active' },
    });
    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(data.total).toBe(1);
    expect(data.scenes[0].id).toBe(active.id);
    await client.close();
  });
});

// ---------------------------------------------------------------------------
// lobster_create_scene
// ---------------------------------------------------------------------------

describe('lobster_create_scene', () => {
  it('creates a new scene with valid bot ids', async () => {
    const bot = makeBot();
    const store = makeStore([bot]);
    const { client } = await connectClient(store);
    const result = await client.callTool({
      name: 'lobster_create_scene',
      arguments: { sceneType: 'werewolf', botIds: [bot.id] },
    });
    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(data.success).toBe(true);
    expect(data.scene.type).toBe('werewolf');
    expect(data.scene.botIds).toContain(bot.id);
    await client.close();
  });

  it('adds the scene to the store', async () => {
    const bot = makeBot();
    const store = makeStore([bot]);
    const { client } = await connectClient(store);
    await client.callTool({
      name: 'lobster_create_scene',
      arguments: { sceneType: 'werewolf', botIds: [bot.id] },
    });
    expect(store.scenes.size).toBe(1);
    await client.close();
  });

  it('returns isError when a bot id is unknown', async () => {
    const { client } = await connectClient(makeStore());
    const result = await client.callTool({
      name: 'lobster_create_scene',
      arguments: { sceneType: 'werewolf', botIds: ['ghost-bot'] },
    });
    expect(result.isError).toBe(true);
    await client.close();
  });

  it('merges bot ids when joining an existing scene', async () => {
    const bot1 = makeBot();
    const bot2 = makeBot();
    const existingScene = makeScene([bot1.id], {
      id: 'werewolf:fixed',
      type: 'werewolf',
    });
    const store = makeStore([bot1, bot2], [existingScene]);
    const { client } = await connectClient(store);
    await client.callTool({
      name: 'lobster_create_scene',
      arguments: {
        sceneType: 'werewolf',
        botIds: [bot2.id],
        sceneId: 'werewolf:fixed',
      },
    });
    const updated = store.scenes.get('werewolf:fixed');
    expect(updated?.botIds).toContain(bot1.id);
    expect(updated?.botIds).toContain(bot2.id);
    await client.close();
  });

  it('respects an explicit sceneId', async () => {
    const bot = makeBot();
    const store = makeStore([bot]);
    const { client } = await connectClient(store);
    await client.callTool({
      name: 'lobster_create_scene',
      arguments: {
        sceneType: 'werewolf',
        botIds: [bot.id],
        sceneId: 'werewolf:room-99',
      },
    });
    expect(store.scenes.has('werewolf:room-99')).toBe(true);
    await client.close();
  });
});

// ---------------------------------------------------------------------------
// lobster_submit_action
// ---------------------------------------------------------------------------

describe('lobster_submit_action', () => {
  it('returns a receipt for a valid action', async () => {
    const bot = makeBot();
    const scene = makeScene([bot.id]);
    const { client } = await connectClient(makeStore([bot], [scene]));
    const result = await client.callTool({
      name: 'lobster_submit_action',
      arguments: {
        botId: bot.id,
        sceneId: scene.id,
        actionType: 'speak',
        content: 'Hello world',
      },
    });
    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(data.success).toBe(true);
    expect(data.receipt.type).toBe('speak');
    expect(data.receipt.content).toBe('Hello world');
    expect(data.receipt.botId).toBe(bot.id);
    await client.close();
  });

  it('includes optional target in receipt', async () => {
    const bot = makeBot();
    const target = makeBot();
    const scene = makeScene([bot.id, target.id]);
    const { client } = await connectClient(makeStore([bot, target], [scene]));
    const result = await client.callTool({
      name: 'lobster_submit_action',
      arguments: {
        botId: bot.id,
        sceneId: scene.id,
        actionType: 'vote',
        content: 'I vote for you',
        target: target.id,
      },
    });
    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(data.receipt.target).toBe(target.id);
    await client.close();
  });

  it('returns isError when scene does not exist', async () => {
    const bot = makeBot();
    const { client } = await connectClient(makeStore([bot]));
    const result = await client.callTool({
      name: 'lobster_submit_action',
      arguments: {
        botId: bot.id,
        sceneId: 'no-such-scene',
        actionType: 'speak',
        content: 'test',
      },
    });
    expect(result.isError).toBe(true);
    await client.close();
  });

  it('returns isError when bot is not a member of the scene', async () => {
    const bot = makeBot();
    const outsider = makeBot();
    const scene = makeScene([bot.id]);
    const { client } = await connectClient(makeStore([bot, outsider], [scene]));
    const result = await client.callTool({
      name: 'lobster_submit_action',
      arguments: {
        botId: outsider.id,
        sceneId: scene.id,
        actionType: 'speak',
        content: 'I should not be here',
      },
    });
    expect(result.isError).toBe(true);
    await client.close();
  });
});

// ---------------------------------------------------------------------------
// lobster_scene_status
// ---------------------------------------------------------------------------

describe('lobster_scene_status', () => {
  it('returns the full scene record', async () => {
    const bot = makeBot();
    const scene = makeScene([bot.id], { status: 'active' });
    const { client } = await connectClient(makeStore([bot], [scene]));
    const result = await client.callTool({
      name: 'lobster_scene_status',
      arguments: { sceneId: scene.id },
    });
    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(data.id).toBe(scene.id);
    expect(data.status).toBe('active');
    await client.close();
  });

  it('returns isError for unknown scene id', async () => {
    const { client } = await connectClient(makeStore());
    const result = await client.callTool({
      name: 'lobster_scene_status',
      arguments: { sceneId: 'phantom-scene' },
    });
    expect(result.isError).toBe(true);
    await client.close();
  });
});

// ---------------------------------------------------------------------------
// lobster_engine_health
// ---------------------------------------------------------------------------

describe('lobster_engine_health', () => {
  it('returns status "ok"', async () => {
    const { client } = await connectClient(makeStore());
    const result = await client.callTool({
      name: 'lobster_engine_health',
      arguments: {},
    });
    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(data.status).toBe('ok');
    await client.close();
  });

  it('reflects current bot and scene counts', async () => {
    const bot = makeBot();
    const scene = makeScene([bot.id]);
    const { client } = await connectClient(makeStore([bot], [scene]));
    const result = await client.callTool({
      name: 'lobster_engine_health',
      arguments: {},
    });
    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(data.bots.total).toBe(1);
    expect(data.scenes.total).toBe(1);
    await client.close();
  });

  it('returns a numeric uptime', async () => {
    const { client } = await connectClient(makeStore());
    const result = await client.callTool({
      name: 'lobster_engine_health',
      arguments: {},
    });
    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(typeof data.uptime).toBe('number');
    expect(data.uptime).toBeGreaterThanOrEqual(0);
    await client.close();
  });

  it('returns a timestamp within a reasonable range', async () => {
    const before = Date.now();
    const { client } = await connectClient(makeStore());
    const result = await client.callTool({
      name: 'lobster_engine_health',
      arguments: {},
    });
    const after = Date.now();
    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(data.timestamp).toBeGreaterThanOrEqual(before);
    expect(data.timestamp).toBeLessThanOrEqual(after);
    await client.close();
  });

  it('groups bots by status in the health snapshot', async () => {
    const idle = makeBot({ status: 'idle' });
    const active = makeBot({ status: 'active' });
    const { client } = await connectClient(makeStore([idle, active]));
    const result = await client.callTool({
      name: 'lobster_engine_health',
      arguments: {},
    });
    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(data.bots.byStatus['idle']).toBe(1);
    expect(data.bots.byStatus['active']).toBe(1);
    await client.close();
  });
});

// ---------------------------------------------------------------------------
// createEngineStore
// ---------------------------------------------------------------------------

describe('createEngineStore', () => {
  it('initialises empty maps by default', () => {
    const store = createEngineStore();
    expect(store.bots.size).toBe(0);
    expect(store.scenes.size).toBe(0);
  });

  it('populates from initial arrays', () => {
    const bot = makeBot();
    const scene = makeScene([bot.id]);
    const store = createEngineStore([bot], [scene]);
    expect(store.bots.size).toBe(1);
    expect(store.scenes.size).toBe(1);
  });

  it('addBot persists the bot', () => {
    const store = createEngineStore();
    const bot = makeBot();
    store.addBot(bot);
    expect(store.bots.get(bot.id)).toBe(bot);
  });

  it('addScene persists the scene', () => {
    const store = createEngineStore();
    const bot = makeBot();
    const scene = makeScene([bot.id]);
    store.addScene(scene);
    expect(store.scenes.get(scene.id)).toBe(scene);
  });

  it('updateScene replaces an existing scene', () => {
    const bot = makeBot();
    const scene = makeScene([bot.id], { status: 'waiting' });
    const store = createEngineStore([bot], [scene]);
    const updated: SceneRecord = { ...scene, status: 'active' };
    store.updateScene(updated);
    expect(store.scenes.get(scene.id)?.status).toBe('active');
  });
});
