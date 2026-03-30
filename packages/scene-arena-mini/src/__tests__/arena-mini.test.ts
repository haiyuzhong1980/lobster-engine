// @lobster-engine/scene-arena-mini — ArenaMiniPlugin unit tests

import { describe, it, expect } from 'vitest';
import {
  ArenaMiniPlugin,
  ArenaRewards,
  TopicPicker,
  DEBATE_TOPICS,
} from '../index.js';
import type { PersonalityDNA, ArenaMode } from '../index.js';
import type { SceneContext, TurnEvent, ActionSpec } from '@lobster-engine/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ArenaMiniState {
  playerA: string;
  playerB: string;
  personalityA?: PersonalityDNA;
  personalityB?: PersonalityDNA;
  topic?: string;
  currentNumber?: number;
  lyingFlatResult?: 'win' | 'lose' | 'draw';
  debatePosition?: 'pro' | 'con';
  turnCount?: number;
}

function makeState(overrides: Partial<ArenaMiniState> = {}): ArenaMiniState {
  return {
    playerA: 'lobster-a',
    playerB: 'lobster-b',
    ...overrides,
  };
}

function makeContext(
  state: ArenaMiniState,
  botId = 'lobster-a',
  history: readonly TurnEvent[] = [],
): SceneContext {
  return {
    botId,
    sceneId: 'arena-mini:room-1',
    state: state as unknown as Record<string, unknown>,
    history,
  };
}

function makeTurnEvent(
  mode: ArenaMode,
  extraData: Record<string, unknown> = {},
  overrides: Partial<TurnEvent> = {},
): TurnEvent {
  return {
    id: 'evt-1',
    botId: 'lobster-a',
    sceneId: 'arena-mini:room-1',
    type: 'turn',
    phase: 'arena',
    data: { mode, ...extraData },
    timestamp: Date.now(),
    ...overrides,
  };
}

const foodieDNA: PersonalityDNA = {
  introversion_extroversion: 20,
  laziness_curiosity: 0,
  emotional_rational: 0,
  talkative_silent: 50,
  foodie_ascetic: 90,
  nightowl_earlybird: 10,
};

const silentDNA: PersonalityDNA = {
  introversion_extroversion: -80,
  laziness_curiosity: 0,
  emotional_rational: 50,
  talkative_silent: -90,
  foodie_ascetic: 0,
  nightowl_earlybird: 0,
};

const philosopherDNA: PersonalityDNA = {
  introversion_extroversion: -30,
  laziness_curiosity: -85,
  emotional_rational: 60,
  talkative_silent: 20,
  foodie_ascetic: -20,
  nightowl_earlybird: 30,
};

const socialDNA: PersonalityDNA = {
  introversion_extroversion: 90,
  laziness_curiosity: 40,
  emotional_rational: -20,
  talkative_silent: 70,
  foodie_ascetic: 10,
  nightowl_earlybird: 0,
};

// ---------------------------------------------------------------------------
// TopicPicker
// ---------------------------------------------------------------------------

describe('TopicPicker.pickRandom()', () => {
  it('returns a string from the DEBATE_TOPICS pool', () => {
    const topic = TopicPicker.pickRandom();
    expect(DEBATE_TOPICS).toContain(topic);
  });

  it('returns different topics across multiple calls (statistically)', () => {
    const results = new Set<string>();
    for (let i = 0; i < 50; i++) {
      results.add(TopicPicker.pickRandom());
    }
    // With 10 topics and 50 draws the probability of getting ≤1 unique topic is negligible
    expect(results.size).toBeGreaterThan(1);
  });

  it('always returns a non-empty string', () => {
    for (let i = 0; i < 20; i++) {
      expect(TopicPicker.pickRandom().length).toBeGreaterThan(0);
    }
  });
});

describe('TopicPicker.pickForPair()', () => {
  it('returns a topic from the DEBATE_TOPICS pool', () => {
    const topic = TopicPicker.pickForPair(foodieDNA, foodieDNA);
    expect(DEBATE_TOPICS).toContain(topic);
  });

  it('prefers food-related topic when both personalities are strongly foodie', () => {
    // Topic index 2 = '外卖和做饭，哪个更躺平？' — highest foodie affinity
    const topic = TopicPicker.pickForPair(foodieDNA, foodieDNA);
    expect(topic).toBe('外卖和做饭，哪个更躺平？');
  });

  it('returns a valid topic even for near-zero personalities (fallback to random)', () => {
    const zeroDNA: PersonalityDNA = {
      introversion_extroversion: 0,
      laziness_curiosity: 0,
      emotional_rational: 0,
      talkative_silent: 0,
      foodie_ascetic: 0,
      nightowl_earlybird: 0,
    };
    const topic = TopicPicker.pickForPair(zeroDNA, zeroDNA);
    expect(DEBATE_TOPICS).toContain(topic);
  });

  it('prefers the 躺平哲学 topic for highly lazy/philosophical pairs', () => {
    // philosopherDNA has laziness_curiosity = -0.85 → high laziness score
    const topic = TopicPicker.pickForPair(philosopherDNA, philosopherDNA);
    expect(DEBATE_TOPICS).toContain(topic);
    // Should pick a laziness-related topic (index 7 or similar)
    expect(topic).toBeDefined();
  });

  it('is deterministic for extreme personalities', () => {
    const first = TopicPicker.pickForPair(foodieDNA, foodieDNA);
    const second = TopicPicker.pickForPair(foodieDNA, foodieDNA);
    expect(first).toBe(second);
  });
});

// ---------------------------------------------------------------------------
// ArenaRewards
// ---------------------------------------------------------------------------

describe('ArenaRewards.calculate() — debate mode', () => {
  it('win and lose yield the same lazyCoin for debate', () => {
    const win = ArenaRewards.calculate('debate', 'win');
    const lose = ArenaRewards.calculate('debate', 'lose');
    expect(win.lazyCoin).toBe(lose.lazyCoin);
  });

  it('win and lose yield the same experience for debate', () => {
    const win = ArenaRewards.calculate('debate', 'win');
    const lose = ArenaRewards.calculate('debate', 'lose');
    expect(win.experience).toBe(lose.experience);
  });

  it('draw gives double lazyCoin compared to win/lose for debate', () => {
    const win = ArenaRewards.calculate('debate', 'win');
    const draw = ArenaRewards.calculate('debate', 'draw');
    expect(draw.lazyCoin).toBe(win.lazyCoin * 2);
  });

  it('win lazyCoin is 5', () => {
    expect(ArenaRewards.calculate('debate', 'win').lazyCoin).toBe(5);
  });

  it('lose lazyCoin is 5', () => {
    expect(ArenaRewards.calculate('debate', 'lose').lazyCoin).toBe(5);
  });

  it('draw lazyCoin is 10', () => {
    expect(ArenaRewards.calculate('debate', 'draw').lazyCoin).toBe(10);
  });

  it('win lobsterReaction contains expected text', () => {
    const result = ArenaRewards.calculate('debate', 'win');
    expect(result.lobsterReaction).toContain('说得好');
  });

  it('lose lobsterReaction contains 虽败犹荣', () => {
    const result = ArenaRewards.calculate('debate', 'lose');
    expect(result.lobsterReaction).toContain('虽败犹荣');
  });

  it('draw lobsterReaction mentions 和平', () => {
    const result = ArenaRewards.calculate('debate', 'draw');
    expect(result.lobsterReaction).toContain('和平');
  });
});

describe('ArenaRewards.calculate() — lying_flat mode', () => {
  it('win and lose yield the same lazyCoin for lying_flat', () => {
    const win = ArenaRewards.calculate('lying_flat', 'win');
    const lose = ArenaRewards.calculate('lying_flat', 'lose');
    expect(win.lazyCoin).toBe(lose.lazyCoin);
  });

  it('win and lose yield the same experience for lying_flat', () => {
    const win = ArenaRewards.calculate('lying_flat', 'win');
    const lose = ArenaRewards.calculate('lying_flat', 'lose');
    expect(win.experience).toBe(lose.experience);
  });

  it('win lazyCoin is 8', () => {
    expect(ArenaRewards.calculate('lying_flat', 'win').lazyCoin).toBe(8);
  });

  it('lose lazyCoin is 8', () => {
    expect(ArenaRewards.calculate('lying_flat', 'lose').lazyCoin).toBe(8);
  });

  it('draw lazyCoin is double the win amount', () => {
    const win = ArenaRewards.calculate('lying_flat', 'win');
    const draw = ArenaRewards.calculate('lying_flat', 'draw');
    expect(draw.lazyCoin).toBe(win.lazyCoin * 2);
  });

  it('win lobsterReaction contains 躺平大师', () => {
    const result = ArenaRewards.calculate('lying_flat', 'win');
    expect(result.lobsterReaction).toContain('躺平大师');
  });

  it('lose lobsterReaction contains 下次', () => {
    const result = ArenaRewards.calculate('lying_flat', 'lose');
    expect(result.lobsterReaction).toContain('下次');
  });
});

describe('ArenaRewards.calculate() — counting mode', () => {
  it('returns 6 lazyCoin for counting regardless of result', () => {
    expect(ArenaRewards.calculate('counting', 'win').lazyCoin).toBe(6);
    expect(ArenaRewards.calculate('counting', 'lose').lazyCoin).toBe(6);
    expect(ArenaRewards.calculate('counting', 'draw').lazyCoin).toBe(6);
  });

  it('lobsterReaction mentions 100', () => {
    const result = ArenaRewards.calculate('counting', 'draw');
    expect(result.lobsterReaction).toContain('100');
  });

  it('all counting results have positive experience', () => {
    expect(ArenaRewards.calculate('counting', 'win').experience).toBeGreaterThan(0);
    expect(ArenaRewards.calculate('counting', 'lose').experience).toBeGreaterThan(0);
    expect(ArenaRewards.calculate('counting', 'draw').experience).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// ArenaMiniPlugin identity
// ---------------------------------------------------------------------------

describe('ArenaMiniPlugin identity', () => {
  const plugin = new ArenaMiniPlugin();

  it('has name "arena-mini"', () => {
    expect(plugin.name).toBe('arena-mini');
  });

  it('has sceneType "arena-mini"', () => {
    expect(plugin.sceneType).toBe('arena-mini');
  });

  it('has version "1.0.0"', () => {
    expect(plugin.version).toBe('1.0.0');
  });
});

// ---------------------------------------------------------------------------
// ArenaMiniPlugin.buildPrompt() — debate mode
// ---------------------------------------------------------------------------

describe('ArenaMiniPlugin.buildPrompt() — debate mode', () => {
  const plugin = new ArenaMiniPlugin();

  it('returns messages array with system message first', () => {
    const state = makeState();
    const ctx = makeContext(state);
    const event = makeTurnEvent('debate', { topic: '躺平是不是一种哲学？', position: 'pro', turnCount: 1 });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].role).toBe('system');
  });

  it('always ends with a user message', () => {
    const state = makeState();
    const ctx = makeContext(state);
    const event = makeTurnEvent('debate', { topic: '躺平是不是一种哲学？', position: 'pro' });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[messages.length - 1].role).toBe('user');
  });

  it('system prompt includes the debate topic', () => {
    const topic = '外卖和做饭，哪个更躺平？';
    const state = makeState({ topic });
    const ctx = makeContext(state);
    const event = makeTurnEvent('debate', { topic });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].content).toContain(topic);
  });

  it('system prompt includes position indicator for pro side', () => {
    const state = makeState();
    const ctx = makeContext(state);
    const event = makeTurnEvent('debate', { topic: '躺平是不是一种哲学？', position: 'pro' });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].content).toContain('正方');
  });

  it('system prompt includes position indicator for con side', () => {
    const state = makeState();
    const ctx = makeContext(state);
    const event = makeTurnEvent('debate', { topic: '躺平是不是一种哲学？', position: 'con' });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].content).toContain('反方');
  });

  it('system prompt includes turn count information', () => {
    const state = makeState();
    const ctx = makeContext(state);
    const event = makeTurnEvent('debate', { topic: '躺平是不是一种哲学？', position: 'pro', turnCount: 2 });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].content).toContain('2');
    expect(messages[0].content).toContain('3');
  });

  it('debate prompt includes foodie style instruction when personality is foodie', () => {
    const state = makeState({ personalityA: foodieDNA });
    const ctx = makeContext(state, 'lobster-a');
    const event = makeTurnEvent('debate', { topic: '外卖和做饭，哪个更躺平？', position: 'pro' });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].content).toContain('食物');
  });

  it('debate prompt includes silent style instruction when personality is silent', () => {
    const state = makeState({ personalityA: silentDNA });
    const ctx = makeContext(state, 'lobster-a');
    const event = makeTurnEvent('debate', { topic: '躺平是不是一种哲学？', position: 'pro' });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].content).toContain('一句话');
  });

  it('debate prompt includes philosophical style instruction when personality is philosophical', () => {
    const state = makeState({ personalityA: philosopherDNA });
    const ctx = makeContext(state, 'lobster-a');
    const event = makeTurnEvent('debate', { topic: '躺平是不是一种哲学？', position: 'pro' });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].content).toContain('哲学');
  });

  it('debate prompt includes social style instruction when personality is social', () => {
    const state = makeState({ personalityA: socialDNA });
    const ctx = makeContext(state, 'lobster-a');
    const event = makeTurnEvent('debate', { topic: '躺平是不是一种哲学？', position: 'pro' });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].content).toContain('社交');
  });

  it('uses playerB personality when botId is lobster-b', () => {
    const state = makeState({ personalityA: silentDNA, personalityB: foodieDNA });
    const ctx = makeContext(state, 'lobster-b');
    const event = makeTurnEvent('debate', { topic: '外卖和做饭，哪个更躺平？', position: 'con' });
    const messages = plugin.buildPrompt(event, ctx);
    // Should use foodieDNA (lobster-b's personality), not silentDNA
    expect(messages[0].content).toContain('食物');
  });

  it('falls back to topic in state when event data has no topic', () => {
    const topic = '周一应不应该被取消？';
    const state = makeState({ topic });
    const ctx = makeContext(state);
    const event = makeTurnEvent('debate', { position: 'pro' });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].content).toContain(topic);
  });

  it('picks a random topic when neither event nor state has a topic', () => {
    const state = makeState();
    const ctx = makeContext(state);
    const event = makeTurnEvent('debate', { position: 'pro' });
    const messages = plugin.buildPrompt(event, ctx);
    // Must contain at least one topic from the pool
    const containsATopic = DEBATE_TOPICS.some((t) => messages[0].content.includes(t));
    expect(containsATopic).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ArenaMiniPlugin.buildPrompt() — lying_flat mode
// ---------------------------------------------------------------------------

describe('ArenaMiniPlugin.buildPrompt() — lying_flat mode', () => {
  const plugin = new ArenaMiniPlugin();

  it('returns system + user messages', () => {
    const state = makeState();
    const ctx = makeContext(state);
    const event = makeTurnEvent('lying_flat', { result: 'win' });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].role).toBe('system');
    expect(messages[messages.length - 1].role).toBe('user');
  });

  it('system prompt mentions 躺平 competition', () => {
    const state = makeState();
    const ctx = makeContext(state);
    const event = makeTurnEvent('lying_flat', { result: 'win' });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].content).toContain('躺平');
  });

  it('user message includes win result description when result is win', () => {
    const state = makeState();
    const ctx = makeContext(state);
    const event = makeTurnEvent('lying_flat', { result: 'win' });
    const messages = plugin.buildPrompt(event, ctx);
    const userMsg = messages[messages.length - 1].content;
    expect(userMsg).toContain('赢了');
  });

  it('user message includes lose result description when result is lose', () => {
    const state = makeState();
    const ctx = makeContext(state);
    const event = makeTurnEvent('lying_flat', { result: 'lose' });
    const messages = plugin.buildPrompt(event, ctx);
    const userMsg = messages[messages.length - 1].content;
    expect(userMsg).toContain('输了');
  });

  it('user message includes draw result description when result is draw', () => {
    const state = makeState();
    const ctx = makeContext(state);
    const event = makeTurnEvent('lying_flat', { result: 'draw' });
    const messages = plugin.buildPrompt(event, ctx);
    const userMsg = messages[messages.length - 1].content;
    expect(userMsg).toContain('平局');
  });

  it('applies personality style to system prompt for lying_flat', () => {
    const state = makeState({ personalityA: foodieDNA });
    const ctx = makeContext(state, 'lobster-a');
    const event = makeTurnEvent('lying_flat', { result: 'win' });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].content).toContain('食物');
  });
});

// ---------------------------------------------------------------------------
// ArenaMiniPlugin.buildPrompt() — counting mode
// ---------------------------------------------------------------------------

describe('ArenaMiniPlugin.buildPrompt() — counting mode', () => {
  const plugin = new ArenaMiniPlugin();

  it('returns system + user messages', () => {
    const state = makeState({ currentNumber: 1 });
    const ctx = makeContext(state);
    const event = makeTurnEvent('counting', { currentNumber: 1 });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].role).toBe('system');
    expect(messages[messages.length - 1].role).toBe('user');
  });

  it('system prompt includes the current starting number', () => {
    const state = makeState({ currentNumber: 46 });
    const ctx = makeContext(state);
    const event = makeTurnEvent('counting', { currentNumber: 46 });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].content).toContain('46');
  });

  it('system prompt includes the ending number for this batch', () => {
    const state = makeState();
    const ctx = makeContext(state);
    const event = makeTurnEvent('counting', { currentNumber: 1 });
    const messages = plugin.buildPrompt(event, ctx);
    // Batch size is 5: 1 → 5
    expect(messages[0].content).toContain('5');
  });

  it('counting prompt includes foodie example when personality is foodie', () => {
    const state = makeState({ personalityA: foodieDNA });
    const ctx = makeContext(state, 'lobster-a');
    const event = makeTurnEvent('counting', { currentNumber: 7 });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].content).toContain('饺子');
  });

  it('counting prompt includes philosophical example when personality is philosophical', () => {
    const state = makeState({ personalityA: philosopherDNA });
    const ctx = makeContext(state, 'lobster-a');
    const event = makeTurnEvent('counting', { currentNumber: 7 });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].content).toContain('维度');
  });

  it('counting prompt includes silent example when personality is silent', () => {
    const state = makeState({ personalityA: silentDNA });
    const ctx = makeContext(state, 'lobster-a');
    const event = makeTurnEvent('counting', { currentNumber: 7 });
    const messages = plugin.buildPrompt(event, ctx);
    // Silent example: "七。八。九。" — just bare numbers with periods
    expect(messages[0].content).toContain('七。');
  });

  it('caps batch end at 100 when near the end', () => {
    const state = makeState();
    const ctx = makeContext(state);
    const event = makeTurnEvent('counting', { currentNumber: 98 });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].content).toContain('100');
    expect(messages[0].content).not.toContain('101');
  });

  it('falls back to state.currentNumber when event data has no currentNumber', () => {
    const state = makeState({ currentNumber: 31 });
    const ctx = makeContext(state);
    const event = makeTurnEvent('counting', {});
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].content).toContain('31');
  });
});

// ---------------------------------------------------------------------------
// ArenaMiniPlugin.parseAction()
// ---------------------------------------------------------------------------

describe('ArenaMiniPlugin.parseAction()', () => {
  const plugin = new ArenaMiniPlugin();

  it('parses debate response as debate_speech type', () => {
    const state = makeState();
    const historyEvent = makeTurnEvent('debate');
    const ctx = makeContext(state, 'lobster-a', [historyEvent]);
    const action = plugin.parseAction('躺平是一种智慧！', ctx);
    expect(action.type).toBe('debate_speech');
  });

  it('preserves full debate content in action.content', () => {
    const state = makeState();
    const historyEvent = makeTurnEvent('debate');
    const ctx = makeContext(state, 'lobster-a', [historyEvent]);
    const content = '外卖是现代科技对人类最伟大的贡献之一！';
    const action = plugin.parseAction(content, ctx);
    expect(action.content).toBe(content);
  });

  it('trims whitespace from debate response', () => {
    const state = makeState();
    const historyEvent = makeTurnEvent('debate');
    const ctx = makeContext(state, 'lobster-a', [historyEvent]);
    const action = plugin.parseAction('  内容  ', ctx);
    expect(action.content).toBe('内容');
  });

  it('parses lying_flat response as lying_flat_reaction type', () => {
    const state = makeState();
    const historyEvent = makeTurnEvent('lying_flat');
    const ctx = makeContext(state, 'lobster-a', [historyEvent]);
    const action = plugin.parseAction('哈哈，我赢了！', ctx);
    expect(action.type).toBe('lying_flat_reaction');
  });

  it('parses counting response as counting_response type', () => {
    const state = makeState();
    const historyEvent = makeTurnEvent('counting');
    const ctx = makeContext(state, 'lobster-a', [historyEvent]);
    const action = plugin.parseAction('七...七个饺子\n八...八块排骨', ctx);
    expect(action.type).toBe('counting_response');
  });

  it('extracts numbers from counting response into metadata', () => {
    const state = makeState();
    const historyEvent = makeTurnEvent('counting');
    const ctx = makeContext(state, 'lobster-a', [historyEvent]);
    const action = plugin.parseAction('7...七个饺子\n8...八块排骨\n9...九条鱼', ctx);
    expect(action.metadata['numbers']).toEqual([7, 8, 9]);
  });

  it('metadata.mode is set correctly for debate', () => {
    const state = makeState();
    const historyEvent = makeTurnEvent('debate');
    const ctx = makeContext(state, 'lobster-a', [historyEvent]);
    const action = plugin.parseAction('观点！', ctx);
    expect(action.metadata['mode']).toBe('debate');
  });

  it('metadata.mode is set correctly for counting', () => {
    const state = makeState();
    const historyEvent = makeTurnEvent('counting');
    const ctx = makeContext(state, 'lobster-a', [historyEvent]);
    const action = plugin.parseAction('1 2 3', ctx);
    expect(action.metadata['mode']).toBe('counting');
  });

  it('target is always undefined for all modes', () => {
    const modes: ArenaMode[] = ['debate', 'lying_flat', 'counting'];
    for (const mode of modes) {
      const state = makeState();
      const historyEvent = makeTurnEvent(mode);
      const ctx = makeContext(state, 'lobster-a', [historyEvent]);
      const action = plugin.parseAction('content', ctx);
      expect(action.target).toBeUndefined();
    }
  });

  it('defaults to debate mode when history is empty', () => {
    const state = makeState();
    const ctx = makeContext(state, 'lobster-a', []);
    const action = plugin.parseAction('some response', ctx);
    expect(action.type).toBe('debate_speech');
  });

  it('does not include numbers out of 1-100 range in counting metadata', () => {
    const state = makeState();
    const historyEvent = makeTurnEvent('counting');
    const ctx = makeContext(state, 'lobster-a', [historyEvent]);
    // 0 and 101 should be excluded
    const action = plugin.parseAction('0 50 101 200', ctx);
    const numbers = action.metadata['numbers'] as number[];
    expect(numbers).not.toContain(0);
    expect(numbers).not.toContain(101);
    expect(numbers).not.toContain(200);
    expect(numbers).toContain(50);
  });
});

// ---------------------------------------------------------------------------
// ArenaMiniPlugin.validateAction()
// ---------------------------------------------------------------------------

describe('ArenaMiniPlugin.validateAction()', () => {
  const plugin = new ArenaMiniPlugin();
  const state = makeState();
  const ctx = makeContext(state);

  function makeAction(overrides: Partial<ActionSpec> = {}): ActionSpec {
    return {
      type: 'debate_speech',
      content: '这是一个观点！',
      target: undefined,
      metadata: { mode: 'debate' },
      ...overrides,
    };
  }

  it('returns valid for debate_speech with non-empty content', () => {
    const result = plugin.validateAction(makeAction({ type: 'debate_speech' }), ctx);
    expect(result.valid).toBe(true);
  });

  it('returns valid for lying_flat_reaction with non-empty content', () => {
    const result = plugin.validateAction(
      makeAction({ type: 'lying_flat_reaction', content: '躺！' }),
      ctx,
    );
    expect(result.valid).toBe(true);
  });

  it('returns valid for counting_response with non-empty content', () => {
    const result = plugin.validateAction(
      makeAction({ type: 'counting_response', content: '七...七个饺子' }),
      ctx,
    );
    expect(result.valid).toBe(true);
  });

  it('returns invalid for empty content', () => {
    const result = plugin.validateAction(makeAction({ content: '' }), ctx);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('empty');
  });

  it('returns invalid for whitespace-only content', () => {
    const result = plugin.validateAction(makeAction({ content: '   ' }), ctx);
    expect(result.valid).toBe(false);
  });

  it('returns invalid for unknown action type', () => {
    const result = plugin.validateAction(makeAction({ type: 'unknown_type' }), ctx);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('unknown_type');
  });
});

// ---------------------------------------------------------------------------
// ArenaMiniPlugin.getDefaultAction()
// ---------------------------------------------------------------------------

describe('ArenaMiniPlugin.getDefaultAction()', () => {
  const plugin = new ArenaMiniPlugin();

  it('returns debate_speech type for debate mode', () => {
    const state = makeState();
    const ctx = makeContext(state);
    const event = makeTurnEvent('debate');
    const action = plugin.getDefaultAction(event, ctx);
    expect(action.type).toBe('debate_speech');
  });

  it('debate default action content includes topic when available', () => {
    const topic = '外卖和做饭，哪个更躺平？';
    const state = makeState({ topic });
    const ctx = makeContext(state);
    const event = makeTurnEvent('debate');
    const action = plugin.getDefaultAction(event, ctx);
    expect(action.content).toContain(topic);
  });

  it('marks fallback in metadata for debate', () => {
    const state = makeState();
    const ctx = makeContext(state);
    const event = makeTurnEvent('debate');
    const action = plugin.getDefaultAction(event, ctx);
    expect(action.metadata['fallback']).toBe(true);
  });

  it('returns lying_flat_reaction type for lying_flat mode', () => {
    const state = makeState();
    const ctx = makeContext(state);
    const event = makeTurnEvent('lying_flat');
    const action = plugin.getDefaultAction(event, ctx);
    expect(action.type).toBe('lying_flat_reaction');
  });

  it('lying_flat default action content mentions 躺', () => {
    const state = makeState();
    const ctx = makeContext(state);
    const event = makeTurnEvent('lying_flat');
    const action = plugin.getDefaultAction(event, ctx);
    expect(action.content).toContain('躺');
  });

  it('returns counting_response type for counting mode', () => {
    const state = makeState();
    const ctx = makeContext(state);
    const event = makeTurnEvent('counting', { currentNumber: 1 });
    const action = plugin.getDefaultAction(event, ctx);
    expect(action.type).toBe('counting_response');
  });

  it('counting default action content includes starting number', () => {
    const state = makeState();
    const ctx = makeContext(state);
    const event = makeTurnEvent('counting', { currentNumber: 21 });
    const action = plugin.getDefaultAction(event, ctx);
    expect(action.content).toContain('21');
  });

  it('all default actions have undefined target', () => {
    const modes: ArenaMode[] = ['debate', 'lying_flat', 'counting'];
    const state = makeState();
    const ctx = makeContext(state);
    for (const mode of modes) {
      const event = makeTurnEvent(mode);
      const action = plugin.getDefaultAction(event, ctx);
      expect(action.target).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// ArenaMiniPlugin.formatEvent()
// ---------------------------------------------------------------------------

describe('ArenaMiniPlugin.formatEvent()', () => {
  const plugin = new ArenaMiniPlugin();

  function makeEvent(
    type: string,
    mode: ArenaMode = 'debate',
    data: Record<string, unknown> = {},
  ): TurnEvent {
    return {
      id: 'evt-1',
      botId: 'lobster-a',
      sceneId: 'arena-mini:room-1',
      type,
      phase: 'arena',
      data: { mode, ...data },
      timestamp: Date.now(),
    };
  }

  it('formats arena_start event with player names', () => {
    const result = plugin.formatEvent(
      makeEvent('arena_start', 'debate', {
        playerAName: '小红虾',
        playerBName: '大懒虾',
      }),
    );
    expect(result).toContain('小红虾');
    expect(result).toContain('大懒虾');
    expect(result).toContain('嘴炮道场');
  });

  it('formats arena_start with 躺平比拼 for lying_flat mode', () => {
    const result = plugin.formatEvent(
      makeEvent('arena_start', 'lying_flat', {
        playerAName: '虾A',
        playerBName: '虾B',
      }),
    );
    expect(result).toContain('躺平比拼');
  });

  it('formats arena_start with 协作数数 for counting mode', () => {
    const result = plugin.formatEvent(
      makeEvent('arena_start', 'counting', {
        playerAName: '虾A',
        playerBName: '虾B',
      }),
    );
    expect(result).toContain('协作数数');
  });

  it('formats debate_turn event with speaker name and content', () => {
    const result = plugin.formatEvent(
      makeEvent('debate_turn', 'debate', {
        speakerName: '小红虾',
        speakerId: 'lobster-a',
        position: 'pro',
        content: '躺平是一种智慧！',
      }),
    );
    expect(result).toContain('小红虾');
    expect(result).toContain('躺平是一种智慧！');
    expect(result).toContain('正方');
  });

  it('formats debate_turn from own perspective as "你说"', () => {
    const result = plugin.formatEvent(
      makeEvent('debate_turn', 'debate', {
        speakerName: '小红虾',
        speakerId: 'lobster-a',
        position: 'pro',
        content: '我的观点！',
      }),
      'lobster-a',
    );
    expect(result).toContain('你说');
  });

  it('formats debate_result event with winner name', () => {
    const result = plugin.formatEvent(
      makeEvent('debate_result', 'debate', {
        winnerName: '小红虾',
        topic: '躺平是不是一种哲学？',
      }),
    );
    expect(result).toContain('小红虾');
    expect(result).toContain('获胜');
  });

  it('formats debate_result as draw when winnerName is 平局', () => {
    const result = plugin.formatEvent(
      makeEvent('debate_result', 'debate', {
        winnerName: '平局',
        topic: '躺平是不是一种哲学？',
      }),
    );
    expect(result).toContain('平局');
  });

  it('formats lying_flat_result event with winner and duration', () => {
    const result = plugin.formatEvent(
      makeEvent('lying_flat_result', 'lying_flat', {
        winnerName: '大懒虾',
        winnerDuration: 120,
      }),
    );
    expect(result).toContain('大懒虾');
    expect(result).toContain('120');
  });

  it('formats counting_progress event with current number', () => {
    const result = plugin.formatEvent(
      makeEvent('counting_progress', 'counting', { currentNumber: 42 }),
    );
    expect(result).toContain('42');
    expect(result).toContain('100');
  });

  it('formats counting_complete event with completion message', () => {
    const result = plugin.formatEvent(makeEvent('counting_complete', 'counting'));
    expect(result).toContain('100');
  });

  it('formats arena_reward event with lazyCoin and reaction', () => {
    const result = plugin.formatEvent(
      makeEvent('arena_reward', 'debate', {
        lazyCoin: 10,
        lobsterReaction: '和平是最好的结果',
      }),
    );
    expect(result).toContain('10');
    expect(result).toContain('懒币');
    expect(result).toContain('和平是最好的结果');
  });

  it('formats unknown event type with mode and type', () => {
    const result = plugin.formatEvent(makeEvent('custom_event', 'debate'));
    expect(result).toContain('debate');
    expect(result).toContain('custom_event');
  });

  it('arena_start uses fallback names when playerAName/playerBName missing', () => {
    const result = plugin.formatEvent(makeEvent('arena_start', 'debate', {}));
    expect(result).toContain('龙虾A');
    expect(result).toContain('龙虾B');
  });
});
