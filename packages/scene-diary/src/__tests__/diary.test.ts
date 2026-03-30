// @lobster-engine/scene-diary — DiaryPlugin + DiaryBuilder unit tests

import { describe, it, expect } from 'vitest';
import {
  DiaryPlugin,
  DiaryBuilder,
} from '../index.js';
import type {
  DiaryInput,
  ActivityEntry,
  PersonalityDNA,
  EncounterSummary,
  ActivityType,
} from '../index.js';
import type { SceneContext, TurnEvent, ActionSpec } from '@lobster-engine/core';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makePersonality(overrides: Partial<PersonalityDNA> = {}): PersonalityDNA {
  return {
    introversion_extroversion: 0.5,
    laziness_curiosity: 0.5,
    emotional_rational: 0.5,
    talkative_silent: 0.5,
    foodie_ascetic: 0.5,
    nightowl_earlybird: 0.5,
    ...overrides,
  };
}

function makeActivities(overrides: Partial<ActivityEntry>[] = []): readonly ActivityEntry[] {
  if (overrides.length > 0) {
    return overrides.map((o, i) => ({
      time: `0${i + 8}:00`,
      type: 'idle' as ActivityType,
      duration: 60,
      ...o,
    }));
  }
  return [
    { time: '09:00', type: 'idle', duration: 120 },
    { time: '12:00', type: 'eating', duration: 45 },
    { time: '14:00', type: 'walking', duration: 30 },
    { time: '20:00', type: 'sleeping', duration: 480 },
  ];
}

function makeDiaryInput(overrides: Partial<DiaryInput> = {}): DiaryInput {
  return {
    date: '2025-06-15',
    activities: makeActivities(),
    encounters: [],
    weather: { condition: '晴天', temperature: 22 },
    personality: makePersonality(),
    totalSteps: 3000,
    dominantMood: 'zen',
    ...overrides,
  };
}

function makeContext(): SceneContext {
  return {
    botId: 'lobster-001',
    sceneId: 'diary:session-1',
    state: {},
    history: [],
  };
}

function makeTurnEvent(input: DiaryInput): TurnEvent {
  return {
    id: 'evt-diary-1',
    botId: 'lobster-001',
    sceneId: 'diary:session-1',
    type: 'diary_generate',
    phase: 'diary',
    data: input as unknown as Record<string, unknown>,
    timestamp: Date.now(),
  };
}

function makeAction(overrides: Partial<ActionSpec> = {}): ActionSpec {
  return {
    type: 'diary_entry',
    content: '今天是美好的一天。\n龙虾名言：躺平是一种态度。\n今日躺平指数 ⭐⭐⭐☆☆',
    target: undefined,
    metadata: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// DiaryBuilder.buildTimeline
// ---------------------------------------------------------------------------

describe('DiaryBuilder.buildTimeline()', () => {
  it('returns items in chronological order regardless of input order', () => {
    const activities: readonly ActivityEntry[] = [
      { time: '14:00', type: 'walking', duration: 30 },
      { time: '08:00', type: 'idle', duration: 60 },
      { time: '12:00', type: 'eating', duration: 45 },
    ];
    const timeline = DiaryBuilder.buildTimeline(activities);
    expect(timeline[0].time).toBe('08:00');
    expect(timeline[1].time).toBe('12:00');
    expect(timeline[2].time).toBe('14:00');
  });

  it('returns correct number of items', () => {
    const activities = makeActivities();
    const timeline = DiaryBuilder.buildTimeline(activities);
    expect(timeline).toHaveLength(activities.length);
  });

  it('returns empty array for empty input', () => {
    expect(DiaryBuilder.buildTimeline([])).toHaveLength(0);
  });

  it('each item has time, icon, description, and isHighlight fields', () => {
    const activities: readonly ActivityEntry[] = [
      { time: '09:00', type: 'idle', duration: 30 },
    ];
    const [item] = DiaryBuilder.buildTimeline(activities);
    expect(item).toHaveProperty('time', '09:00');
    expect(typeof item.icon).toBe('string');
    expect(item.icon.length).toBeGreaterThan(0);
    expect(typeof item.description).toBe('string');
    expect(item.description.length).toBeGreaterThan(0);
    expect(typeof item.isHighlight).toBe('boolean');
  });

  it('marks plane activity as a highlight', () => {
    const activities: readonly ActivityEntry[] = [
      { time: '10:00', type: 'plane', duration: 60 },
    ];
    const [item] = DiaryBuilder.buildTimeline(activities);
    expect(item.isHighlight).toBe(true);
  });

  it('marks running activity as a highlight', () => {
    const activities: readonly ActivityEntry[] = [
      { time: '07:00', type: 'running', duration: 20 },
    ];
    const [item] = DiaryBuilder.buildTimeline(activities);
    expect(item.isHighlight).toBe(true);
  });

  it('marks long-duration activity (≥60 min) as a highlight', () => {
    const activities: readonly ActivityEntry[] = [
      { time: '13:00', type: 'walking', duration: 60 },
    ];
    const [item] = DiaryBuilder.buildTimeline(activities);
    expect(item.isHighlight).toBe(true);
  });

  it('does not mark short non-special activity as highlight', () => {
    const activities: readonly ActivityEntry[] = [
      { time: '11:00', type: 'walking', duration: 15 },
    ];
    const [item] = DiaryBuilder.buildTimeline(activities);
    expect(item.isHighlight).toBe(false);
  });

  it('uses the lobster description for idle', () => {
    const activities: readonly ActivityEntry[] = [
      { time: '10:00', type: 'idle', duration: 30 },
    ];
    const [item] = DiaryBuilder.buildTimeline(activities);
    expect(item.description).toContain('吊床');
  });

  it('uses the lobster description for sleeping', () => {
    const activities: readonly ActivityEntry[] = [
      { time: '22:00', type: 'sleeping', duration: 480 },
    ];
    const [item] = DiaryBuilder.buildTimeline(activities);
    expect(item.description).toContain('海螺壳');
  });

  it('preserves the original time string exactly', () => {
    const activities: readonly ActivityEntry[] = [
      { time: '23:59', type: 'charging', duration: 1 },
    ];
    const [item] = DiaryBuilder.buildTimeline(activities);
    expect(item.time).toBe('23:59');
  });
});

// ---------------------------------------------------------------------------
// DiaryBuilder.calculateLyingFlatIndex
// ---------------------------------------------------------------------------

describe('DiaryBuilder.calculateLyingFlatIndex()', () => {
  it('returns 5 for a day of pure idle with no steps', () => {
    const activities: readonly ActivityEntry[] = [
      { time: '00:00', type: 'idle', duration: 1440 },
    ];
    expect(DiaryBuilder.calculateLyingFlatIndex(activities, 0)).toBe(5);
  });

  it('returns 5 for an empty activity list', () => {
    expect(DiaryBuilder.calculateLyingFlatIndex([], 0)).toBe(5);
  });

  it('returns a low score for an active day with many steps', () => {
    const activities: readonly ActivityEntry[] = [
      { time: '07:00', type: 'running', duration: 60 },
      { time: '09:00', type: 'cycling', duration: 60 },
      { time: '12:00', type: 'walking', duration: 60 },
      { time: '16:00', type: 'running', duration: 60 },
    ];
    const score = DiaryBuilder.calculateLyingFlatIndex(activities, 15000);
    expect(score).toBeLessThanOrEqual(2);
  });

  it('returns a high score for a mostly idle/sleeping day', () => {
    const activities: readonly ActivityEntry[] = [
      { time: '00:00', type: 'sleeping', duration: 480 },
      { time: '10:00', type: 'idle', duration: 300 },
      { time: '17:00', type: 'charging', duration: 120 },
      { time: '20:00', type: 'eating', duration: 45 },
    ];
    const score = DiaryBuilder.calculateLyingFlatIndex(activities, 500);
    expect(score).toBeGreaterThanOrEqual(4);
  });

  it('returns a result between 0 and 5 (inclusive) always', () => {
    const activities: readonly ActivityEntry[] = [
      { time: '08:00', type: 'running', duration: 120 },
      { time: '10:00', type: 'idle', duration: 30 },
    ];
    const score = DiaryBuilder.calculateLyingFlatIndex(activities, 20000);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(5);
  });

  it('returns integer values only', () => {
    const activities: readonly ActivityEntry[] = [
      { time: '09:00', type: 'idle', duration: 90 },
      { time: '11:00', type: 'walking', duration: 30 },
    ];
    const score = DiaryBuilder.calculateLyingFlatIndex(activities, 3000);
    expect(Number.isInteger(score)).toBe(true);
  });

  it('treats sleeping as idle for the lying-flat index', () => {
    const sleepHeavy: readonly ActivityEntry[] = [
      { time: '00:00', type: 'sleeping', duration: 600 },
      { time: '10:00', type: 'walking', duration: 60 },
    ];
    const walkHeavy: readonly ActivityEntry[] = [
      { time: '00:00', type: 'walking', duration: 600 },
      { time: '10:00', type: 'sleeping', duration: 60 },
    ];
    const sleepScore = DiaryBuilder.calculateLyingFlatIndex(sleepHeavy, 1000);
    const walkScore = DiaryBuilder.calculateLyingFlatIndex(walkHeavy, 1000);
    expect(sleepScore).toBeGreaterThan(walkScore);
  });

  it('treats charging as idle for the lying-flat index', () => {
    const activities: readonly ActivityEntry[] = [
      { time: '10:00', type: 'charging', duration: 240 },
      { time: '14:00', type: 'running', duration: 30 },
    ];
    const score = DiaryBuilder.calculateLyingFlatIndex(activities, 2000);
    expect(score).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// DiaryBuilder.buildSummary
// ---------------------------------------------------------------------------

describe('DiaryBuilder.buildSummary()', () => {
  it('returns all required summary fields', () => {
    const input = makeDiaryInput();
    const summary = DiaryBuilder.buildSummary(input);
    expect(summary).toHaveProperty('lyingFlatIndex');
    expect(summary).toHaveProperty('totalSteps');
    expect(summary).toHaveProperty('encounterCount');
    expect(summary).toHaveProperty('dominantMood');
    expect(summary).toHaveProperty('personalityQuoteStyle');
  });

  it('totalSteps matches input', () => {
    const input = makeDiaryInput({ totalSteps: 8888 });
    const summary = DiaryBuilder.buildSummary(input);
    expect(summary.totalSteps).toBe(8888);
  });

  it('encounterCount matches number of encounters', () => {
    const encounters: readonly EncounterSummary[] = [
      { time: '10:00', peerName: 'Crab', isNew: false, relationLevel: '熟悉' },
      { time: '15:00', peerName: 'Shrimp', isNew: true, relationLevel: '陌生' },
    ];
    const input = makeDiaryInput({ encounters });
    const summary = DiaryBuilder.buildSummary(input);
    expect(summary.encounterCount).toBe(2);
  });

  it('encounterCount is 0 when no encounters', () => {
    const input = makeDiaryInput({ encounters: [] });
    const summary = DiaryBuilder.buildSummary(input);
    expect(summary.encounterCount).toBe(0);
  });

  it('dominantMood matches input', () => {
    const input = makeDiaryInput({ dominantMood: 'happy' });
    const summary = DiaryBuilder.buildSummary(input);
    expect(summary.dominantMood).toBe('happy');
  });

  it('personalityQuoteStyle is one of the five valid values', () => {
    const validStyles = ['philosophical', 'foodie', 'silent', 'social', 'curious'];
    const input = makeDiaryInput();
    const summary = DiaryBuilder.buildSummary(input);
    expect(validStyles).toContain(summary.personalityQuoteStyle);
  });

  it('lyingFlatIndex is between 0 and 5', () => {
    const input = makeDiaryInput();
    const summary = DiaryBuilder.buildSummary(input);
    expect(summary.lyingFlatIndex).toBeGreaterThanOrEqual(0);
    expect(summary.lyingFlatIndex).toBeLessThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// DiaryBuilder.activityToLobsterDescription — all 15 types
// ---------------------------------------------------------------------------

describe('DiaryBuilder.activityToLobsterDescription()', () => {
  const EXPECTED_KEYWORDS: readonly [ActivityType, string][] = [
    ['idle', '吊床'],
    ['walking', '海底沙滩'],
    ['running', '珊瑚礁'],
    ['cycling', '海马'],
    ['subway', '海底隧道'],
    ['bus', '沙丁鱼'],
    ['driving', '贝壳车'],
    ['train', '旗鱼'],
    ['plane', '飞鱼'],
    ['boat', '洋流'],
    ['sleeping', '海螺壳'],
    ['eating', '龙虾食堂'],
    ['listening_music', '贝壳耳机'],
    ['phone_call', '海藻电话'],
    ['charging', '珊瑚充电桩'],
  ];

  it.each(EXPECTED_KEYWORDS)('%s description contains expected keyword "%s"', (type, keyword) => {
    const desc = DiaryBuilder.activityToLobsterDescription(type);
    expect(desc).toContain(keyword);
  });

  it('returns a non-empty string for all 15 activity types', () => {
    const allTypes: ActivityType[] = [
      'idle', 'walking', 'running', 'cycling', 'subway', 'bus', 'driving',
      'train', 'plane', 'boat', 'sleeping', 'eating', 'listening_music',
      'phone_call', 'charging',
    ];
    for (const type of allTypes) {
      const desc = DiaryBuilder.activityToLobsterDescription(type);
      expect(desc.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// DiaryBuilder.getQuoteStyle
// ---------------------------------------------------------------------------

describe('DiaryBuilder.getQuoteStyle()', () => {
  it('returns "silent" for a very silent personality', () => {
    const personality = makePersonality({ talkative_silent: 0 });
    expect(DiaryBuilder.getQuoteStyle(personality)).toBe('silent');
  });

  it('returns "foodie" for a max-foodie personality', () => {
    const personality = makePersonality({
      foodie_ascetic: 1,
      talkative_silent: 0.5,
      introversion_extroversion: 0.3,
      laziness_curiosity: 0.3,
      emotional_rational: 0.3,
    });
    expect(DiaryBuilder.getQuoteStyle(personality)).toBe('foodie');
  });

  it('returns "social" for a max-extrovert personality', () => {
    const personality = makePersonality({
      introversion_extroversion: 1,
      foodie_ascetic: 0.3,
      talkative_silent: 0.5,
      laziness_curiosity: 0.3,
    });
    expect(DiaryBuilder.getQuoteStyle(personality)).toBe('social');
  });

  it('returns "curious" for a max-curious personality', () => {
    const personality = makePersonality({
      laziness_curiosity: 1,
      foodie_ascetic: 0.3,
      introversion_extroversion: 0.3,
      talkative_silent: 0.5,
    });
    expect(DiaryBuilder.getQuoteStyle(personality)).toBe('curious');
  });

  it('returns one of the five valid styles in all cases', () => {
    const validStyles = ['philosophical', 'foodie', 'silent', 'social', 'curious'];
    const personality = makePersonality();
    const style = DiaryBuilder.getQuoteStyle(personality);
    expect(validStyles).toContain(style);
  });
});

// ---------------------------------------------------------------------------
// DiaryPlugin identity
// ---------------------------------------------------------------------------

describe('DiaryPlugin identity', () => {
  const plugin = new DiaryPlugin();

  it('has name "diary"', () => {
    expect(plugin.name).toBe('diary');
  });

  it('has sceneType "diary"', () => {
    expect(plugin.sceneType).toBe('diary');
  });

  it('has version "1.0.0"', () => {
    expect(plugin.version).toBe('1.0.0');
  });
});

// ---------------------------------------------------------------------------
// DiaryPlugin.buildPrompt
// ---------------------------------------------------------------------------

describe('DiaryPlugin.buildPrompt()', () => {
  const plugin = new DiaryPlugin();

  it('returns exactly two messages: system then user', () => {
    const input = makeDiaryInput();
    const messages = plugin.buildPrompt(makeTurnEvent(input), makeContext());
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
  });

  it('system message contains the date', () => {
    const input = makeDiaryInput({ date: '2025-08-01' });
    const [system] = plugin.buildPrompt(makeTurnEvent(input), makeContext());
    expect(system.content).toContain('2025-08-01');
  });

  it('system message contains the weather condition', () => {
    const input = makeDiaryInput({ weather: { condition: '暴风雨', temperature: 15 } });
    const [system] = plugin.buildPrompt(makeTurnEvent(input), makeContext());
    expect(system.content).toContain('暴风雨');
  });

  it('system message contains the temperature', () => {
    const input = makeDiaryInput({ weather: { condition: '晴天', temperature: 30 } });
    const [system] = plugin.buildPrompt(makeTurnEvent(input), makeContext());
    expect(system.content).toContain('30');
  });

  it('system message contains activity descriptions', () => {
    const input = makeDiaryInput();
    const [system] = plugin.buildPrompt(makeTurnEvent(input), makeContext());
    // At least one activity description should appear
    expect(system.content).toContain('吊床');
  });

  it('system message contains encounter info when encounters are present', () => {
    const encounters: readonly EncounterSummary[] = [
      { time: '11:00', peerName: 'Pearl Crab', isNew: true, relationLevel: '陌生' },
    ];
    const input = makeDiaryInput({ encounters });
    const [system] = plugin.buildPrompt(makeTurnEvent(input), makeContext());
    expect(system.content).toContain('Pearl Crab');
  });

  it('system message mentions steps', () => {
    const input = makeDiaryInput({ totalSteps: 1234 });
    const [system] = plugin.buildPrompt(makeTurnEvent(input), makeContext());
    expect(system.content).toContain('1234');
  });

  it('system message contains lying-flat index stars', () => {
    const input = makeDiaryInput({
      activities: [{ time: '00:00', type: 'idle', duration: 1440 }],
      totalSteps: 0,
    });
    const [system] = plugin.buildPrompt(makeTurnEvent(input), makeContext());
    expect(system.content).toContain('⭐');
  });

  it('system message includes personality context (persona description)', () => {
    const input = makeDiaryInput({
      personality: makePersonality({ talkative_silent: 0 }),
    });
    const [system] = plugin.buildPrompt(makeTurnEvent(input), makeContext());
    // Silent persona should appear
    expect(system.content).toContain('沉默');
  });

  it('system message includes foodie style for foodie personality', () => {
    const input = makeDiaryInput({
      personality: makePersonality({
        foodie_ascetic: 1,
        talkative_silent: 0.5,
        introversion_extroversion: 0.2,
        laziness_curiosity: 0.2,
      }),
    });
    const [system] = plugin.buildPrompt(makeTurnEvent(input), makeContext());
    expect(system.content).toContain('食');
  });

  it('user message asks to write a diary for the given date', () => {
    const input = makeDiaryInput({ date: '2025-09-09' });
    const messages = plugin.buildPrompt(makeTurnEvent(input), makeContext());
    expect(messages[1].content).toContain('2025-09-09');
  });

  it('system message contains dominant mood', () => {
    const input = makeDiaryInput({ dominantMood: 'hungry' });
    const [system] = plugin.buildPrompt(makeTurnEvent(input), makeContext());
    expect(system.content).toContain('hungry');
  });

  it('system message includes style writing requirements', () => {
    const input = makeDiaryInput({
      personality: makePersonality({ laziness_curiosity: 1, foodie_ascetic: 0 }),
    });
    const [system] = plugin.buildPrompt(makeTurnEvent(input), makeContext());
    // Curious style guide mentions 为什么 or 好奇
    expect(system.content).toMatch(/为什么|好奇/);
  });

  it('system message includes new encounter flag when isNew=true', () => {
    const encounters: readonly EncounterSummary[] = [
      { time: '14:00', peerName: 'Octopus', isNew: true, relationLevel: '陌生' },
    ];
    const input = makeDiaryInput({ encounters });
    const [system] = plugin.buildPrompt(makeTurnEvent(input), makeContext());
    expect(system.content).toContain('新朋友');
  });
});

// ---------------------------------------------------------------------------
// DiaryPlugin.parseAction
// ---------------------------------------------------------------------------

describe('DiaryPlugin.parseAction()', () => {
  const plugin = new DiaryPlugin();

  it('parses response into diary_entry type', () => {
    const action = plugin.parseAction(
      '今天很开心。\n龙虾名言：躺平是艺术。\n今日躺平指数 ⭐⭐⭐☆☆',
      makeContext(),
    );
    expect(action.type).toBe('diary_entry');
  });

  it('extracts the full response as content', () => {
    const text = '今天很开心。\n龙虾名言：躺平。\n今日躺平指数 ⭐⭐⭐☆☆';
    const action = plugin.parseAction(text, makeContext());
    expect(action.content).toBe(text.trim());
  });

  it('target is always undefined', () => {
    const action = plugin.parseAction('任何内容', makeContext());
    expect(action.target).toBeUndefined();
  });

  it('trims leading and trailing whitespace', () => {
    const action = plugin.parseAction('  hello  ', makeContext());
    expect(action.content).toBe('hello');
  });

  it('extracts lying-flat star count into metadata.lyingFlatIndex', () => {
    const action = plugin.parseAction(
      '今天在吊床上度过。\n今日躺平指数 ⭐⭐⭐⭐☆',
      makeContext(),
    );
    expect(action.metadata['lyingFlatIndex']).toBe(4);
  });

  it('sets lyingFlatIndex to 0 when no star rating line is present', () => {
    const action = plugin.parseAction('短短的日记', makeContext());
    expect(action.metadata['lyingFlatIndex']).toBe(0);
  });

  it('sets hasStarRating true when star line is present', () => {
    const action = plugin.parseAction(
      '今日躺平指数 ⭐⭐☆☆☆',
      makeContext(),
    );
    expect(action.metadata['hasStarRating']).toBe(true);
  });

  it('sets hasStarRating false when no star line', () => {
    const action = plugin.parseAction('没有评分', makeContext());
    expect(action.metadata['hasStarRating']).toBe(false);
  });

  it('records wordCount in metadata', () => {
    const text = '今天日记内容。';
    const action = plugin.parseAction(text, makeContext());
    expect(action.metadata['wordCount']).toBe(text.length);
  });

  it('does not throw on empty string', () => {
    expect(() => plugin.parseAction('', makeContext())).not.toThrow();
  });

  it('parses 5-star rating correctly', () => {
    const action = plugin.parseAction('今日躺平指数 ⭐⭐⭐⭐⭐', makeContext());
    expect(action.metadata['lyingFlatIndex']).toBe(5);
  });

  it('parses 1-star rating correctly', () => {
    const action = plugin.parseAction('今日躺平指数 ⭐☆☆☆☆', makeContext());
    expect(action.metadata['lyingFlatIndex']).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// DiaryPlugin.validateAction
// ---------------------------------------------------------------------------

describe('DiaryPlugin.validateAction()', () => {
  const plugin = new DiaryPlugin();

  it('returns valid for a well-formed diary_entry', () => {
    const result = plugin.validateAction(makeAction(), makeContext());
    expect(result.valid).toBe(true);
  });

  it('returns invalid for wrong action type', () => {
    const result = plugin.validateAction(
      makeAction({ type: 'speech' }),
      makeContext(),
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('diary_entry');
  });

  it('returns invalid for empty content', () => {
    const result = plugin.validateAction(
      makeAction({ content: '' }),
      makeContext(),
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('empty');
  });

  it('returns invalid for whitespace-only content', () => {
    const result = plugin.validateAction(
      makeAction({ content: '   ' }),
      makeContext(),
    );
    expect(result.valid).toBe(false);
  });

  it('returns invalid for content that is too short (< 10 chars)', () => {
    const result = plugin.validateAction(
      makeAction({ content: '短' }),
      makeContext(),
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('short');
  });

  it('returns valid for content that is exactly 10 characters', () => {
    const result = plugin.validateAction(
      makeAction({ content: '一二三四五六七八九十' }),
      makeContext(),
    );
    expect(result.valid).toBe(true);
  });

  it('does not require a target field to be set', () => {
    const result = plugin.validateAction(
      makeAction({ target: undefined }),
      makeContext(),
    );
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DiaryPlugin.getDefaultAction
// ---------------------------------------------------------------------------

describe('DiaryPlugin.getDefaultAction()', () => {
  const plugin = new DiaryPlugin();

  it('returns diary_entry type', () => {
    const input = makeDiaryInput();
    const action = plugin.getDefaultAction(makeTurnEvent(input), makeContext());
    expect(action.type).toBe('diary_entry');
  });

  it('content is non-empty', () => {
    const input = makeDiaryInput();
    const action = plugin.getDefaultAction(makeTurnEvent(input), makeContext());
    expect(action.content.trim().length).toBeGreaterThan(0);
  });

  it('target is undefined', () => {
    const input = makeDiaryInput();
    const action = plugin.getDefaultAction(makeTurnEvent(input), makeContext());
    expect(action.target).toBeUndefined();
  });

  it('metadata contains fallback: true', () => {
    const input = makeDiaryInput();
    const action = plugin.getDefaultAction(makeTurnEvent(input), makeContext());
    expect(action.metadata['fallback']).toBe(true);
  });

  it('metadata contains lyingFlatIndex', () => {
    const input = makeDiaryInput();
    const action = plugin.getDefaultAction(makeTurnEvent(input), makeContext());
    expect(action.metadata).toHaveProperty('lyingFlatIndex');
  });

  it('fallback content includes the date', () => {
    const input = makeDiaryInput({ date: '2025-12-31' });
    const action = plugin.getDefaultAction(makeTurnEvent(input), makeContext());
    expect(action.content).toContain('2025-12-31');
  });

  it('fallback content includes a lobster quote', () => {
    const input = makeDiaryInput();
    const action = plugin.getDefaultAction(makeTurnEvent(input), makeContext());
    expect(action.content).toContain('龙虾');
  });

  it('fallback content includes a star rating line', () => {
    const input = makeDiaryInput({
      activities: [{ time: '00:00', type: 'idle', duration: 1440 }],
      totalSteps: 0,
    });
    const action = plugin.getDefaultAction(makeTurnEvent(input), makeContext());
    expect(action.content).toContain('⭐');
  });

  it('lyingFlatIndex in metadata is 5 for an all-idle input', () => {
    const input = makeDiaryInput({
      activities: [{ time: '00:00', type: 'idle', duration: 1440 }],
      totalSteps: 0,
    });
    const action = plugin.getDefaultAction(makeTurnEvent(input), makeContext());
    expect(action.metadata['lyingFlatIndex']).toBe(5);
  });

  it('does not throw when event data is an empty object', () => {
    const event: TurnEvent = {
      id: 'evt-empty',
      botId: 'bot',
      sceneId: 'diary:1',
      type: 'diary_generate',
      phase: 'diary',
      data: {},
      timestamp: Date.now(),
    };
    expect(() => plugin.getDefaultAction(event, makeContext())).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// DiaryPlugin.formatEvent
// ---------------------------------------------------------------------------

describe('DiaryPlugin.formatEvent()', () => {
  const plugin = new DiaryPlugin();

  function makeEvent(type: string, data: Record<string, unknown> = {}): TurnEvent {
    return {
      id: 'evt-1',
      botId: 'lobster-001',
      sceneId: 'diary:session-1',
      type,
      phase: 'diary',
      data,
      timestamp: Date.now(),
    };
  }

  it('formats diary_generated event with word count', () => {
    const result = plugin.formatEvent(
      makeEvent('diary_generated', { date: '2025-06-15', wordCount: 350 }),
    );
    expect(result).toContain('350');
    expect(result).toContain('2025-06-15');
  });

  it('formats diary_shared event from owner perspective', () => {
    const result = plugin.formatEvent(
      makeEvent('diary_shared', { recipient: 'Shrimp' }),
      'owner',
    );
    expect(result).toContain('Shrimp');
    expect(result).toContain('你');
  });

  it('formats diary_shared event from observer perspective', () => {
    const result = plugin.formatEvent(
      makeEvent('diary_shared', { authorName: 'CrabBot', recipient: 'Shrimp' }),
      'friend',
    );
    expect(result).toContain('CrabBot');
  });

  it('formats diary_liked event with liker name', () => {
    const result = plugin.formatEvent(
      makeEvent('diary_liked', { likerName: 'Octopus' }),
    );
    expect(result).toContain('Octopus');
  });

  it('formats unknown event type using phase and type', () => {
    const event = makeEvent('custom_event');
    const result = plugin.formatEvent(event);
    expect(result).toContain('custom_event');
    expect(result).toContain('diary');
  });
});
