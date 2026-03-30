// @lobster-engine/scene-life-pulse — LifePulsePlugin unit tests

import { describe, it, expect } from 'vitest';
import {
  LifePulsePlugin,
  type ActivityType,
  type ActivityEvent,
  type IncentiveReward,
} from '../index.js';
import type { SceneContext, TurnEvent, ActionSpec } from '@lobster-engine/core';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeContext(lobsterId = 'lob-1'): SceneContext {
  return {
    botId: lobsterId,
    sceneId: 'life-pulse:session-1',
    state: {},
    history: [],
  };
}

function makeTurnEvent(overrides: Partial<TurnEvent> = {}): TurnEvent {
  return {
    id: 'evt-1',
    botId: 'lob-1',
    sceneId: 'life-pulse:session-1',
    type: 'activity_update',
    phase: 'active',
    data: { activityType: 'idle' },
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeActivityEvent(
  activityType: ActivityType,
  tsOverride?: number,
  extra: Partial<ActivityEvent> = {},
): ActivityEvent {
  return {
    activityType,
    timestamp: tsOverride ?? Date.now(),
    ...extra,
  };
}

/** Returns a Unix-ms timestamp for today at the given hour (local time). */
function todayAt(hour: number): number {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

/** Returns a Unix-ms timestamp that falls on last Saturday. */
function lastSaturday(hour = 10): number {
  const d = new Date();
  const day = d.getDay(); // 0=Sun … 6=Sat
  const daysToSat = day === 6 ? 0 : day + 1; // days since last Saturday
  d.setDate(d.getDate() - daysToSat);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

/** Repeat an element n times into an array. */
function repeat<T>(value: T, n: number): T[] {
  return Array.from({ length: n }, () => ({ ...value } as T));
}

// ---------------------------------------------------------------------------
// Plugin identity
// ---------------------------------------------------------------------------

describe('LifePulsePlugin identity', () => {
  const plugin = new LifePulsePlugin();

  it('has name "life-pulse"', () => {
    expect(plugin.name).toBe('life-pulse');
  });

  it('has sceneType "life-pulse"', () => {
    expect(plugin.sceneType).toBe('life-pulse');
  });

  it('has version "1.0.0"', () => {
    expect(plugin.version).toBe('1.0.0');
  });
});

// ---------------------------------------------------------------------------
// Activity → Behaviour mapping (all 15 types)
// ---------------------------------------------------------------------------

describe('LifePulsePlugin.getBehavior() — activity mapping', () => {
  const ALL_ACTIVITIES: ReadonlyArray<{
    type: ActivityType;
    scene: string;
    action: string;
    soundEffect: string;
  }> = [
    { type: 'idle',           scene: 'lobster_home',    action: 'hammock_chill',     soundEffect: 'bubble_soft' },
    { type: 'walking',        scene: 'shallow_sea',     action: 'beach_walk',         soundEffect: 'sand_footsteps' },
    { type: 'running',        scene: 'coral_reef',      action: 'fast_swim',          soundEffect: 'water_rush' },
    { type: 'cycling',        scene: 'sea_highway',     action: 'riding_seahorse',    soundEffect: 'seahorse_hooves' },
    { type: 'subway',         scene: 'coral_tunnel',    action: 'tunnel_train',       soundEffect: 'tunnel_echo' },
    { type: 'bus',            scene: 'fish_crowd',      action: 'sardine_bus',        soundEffect: 'crowd_noise' },
    { type: 'driving',        scene: 'sea_highway',     action: 'shell_car',          soundEffect: 'bubble_engine' },
    { type: 'train',          scene: 'deep_tunnel',     action: 'swordfish_express',  soundEffect: 'speed_current' },
    { type: 'plane',          scene: 'sky_above',       action: 'flying_fish',        soundEffect: 'water_burst' },
    { type: 'boat',           scene: 'surface',         action: 'boat_watching',      soundEffect: 'gentle_waves' },
    { type: 'sleeping',       scene: 'lobster_bedroom', action: 'spiral_shell',       soundEffect: 'ocean_whitenoise' },
    { type: 'eating',         scene: 'lobster_canteen', action: 'comfort_food',       soundEffect: 'chewing' },
    { type: 'listening_music',scene: 'current_scene',   action: 'shell_headphones',   soundEffect: 'body_sway' },
    { type: 'phone_call',     scene: 'current_scene',   action: 'conch_phone',        soundEffect: 'mouth_move' },
    { type: 'charging',       scene: 'lobster_home',    action: 'energy_coral',       soundEffect: 'charge_bubbles' },
  ];

  it('covers all 15 activity types', () => {
    expect(ALL_ACTIVITIES).toHaveLength(15);
  });

  for (const { type, scene, action, soundEffect } of ALL_ACTIVITIES) {
    it(`maps "${type}" to scene="${scene}", action="${action}", soundEffect="${soundEffect}"`, () => {
      const behavior = LifePulsePlugin.getBehavior(type);
      expect(behavior.scene).toBe(scene);
      expect(behavior.action).toBe(action);
      expect(behavior.soundEffect).toBe(soundEffect);
    });

    it(`"${type}" behavior has a non-empty description`, () => {
      const behavior = LifePulsePlugin.getBehavior(type);
      expect(behavior.description.length).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------
// calculateIncentive
// ---------------------------------------------------------------------------

describe('LifePulsePlugin.calculateIncentive()', () => {
  // idle > 1 hour → +10
  it('awards 10 lazy coins for idle > 60 min on a weekday', () => {
    const ts = todayAt(14); // 14:00 — not overtime, not weekend
    const reward = LifePulsePlugin.calculateIncentive('idle', 61, { timestamp: ts });
    expect(reward.lazyCoin).toBe(10);
    expect(reward.reaction).toBe('人生赢家');
  });

  it('awards 0 lazy coins for idle exactly 60 min (boundary: not > 60)', () => {
    const ts = todayAt(14);
    const reward = LifePulsePlugin.calculateIncentive('idle', 60, { timestamp: ts });
    expect(reward.lazyCoin).toBe(0);
    expect(reward.reaction).toBeNull();
  });

  it('awards 0 lazy coins for idle at 30 min on a weekday', () => {
    const ts = todayAt(14);
    const reward = LifePulsePlugin.calculateIncentive('idle', 30, { timestamp: ts });
    expect(reward.lazyCoin).toBe(0);
    expect(reward.reaction).toBeNull();
  });

  // walking < 500 steps → +5
  it('awards 5 lazy coins for walking with < 500 steps', () => {
    const ts = todayAt(10);
    const reward = LifePulsePlugin.calculateIncentive('walking', 10, { steps: 499, timestamp: ts });
    expect(reward.lazyCoin).toBe(5);
    expect(reward.reaction).toBe('完美的一天');
  });

  it('awards 5 lazy coins for walking with 0 steps', () => {
    const ts = todayAt(10);
    const reward = LifePulsePlugin.calculateIncentive('walking', 5, { steps: 0, timestamp: ts });
    expect(reward.lazyCoin).toBe(5);
    expect(reward.reaction).toBe('完美的一天');
  });

  it('awards 0 lazy coins for walking with exactly 500 steps (boundary)', () => {
    const ts = todayAt(10);
    const reward = LifePulsePlugin.calculateIncentive('walking', 20, { steps: 500, timestamp: ts });
    expect(reward.lazyCoin).toBe(0);
    expect(reward.reaction).toBeNull();
  });

  // walking > 10 000 steps → +3
  it('awards 3 lazy coins for walking with > 10 000 steps', () => {
    const ts = todayAt(10);
    const reward = LifePulsePlugin.calculateIncentive('walking', 90, { steps: 10_001, timestamp: ts });
    expect(reward.lazyCoin).toBe(3);
    expect(reward.reaction).toBe('今天辛苦了，我帮你躺');
  });

  it('awards 3 lazy coins for walking with exactly 15 000 steps', () => {
    const ts = todayAt(10);
    const reward = LifePulsePlugin.calculateIncentive('walking', 120, { steps: 15_000, timestamp: ts });
    expect(reward.lazyCoin).toBe(3);
    expect(reward.reaction).toBe('今天辛苦了，我帮你躺');
  });

  it('awards 0 lazy coins for walking with exactly 10 000 steps (boundary)', () => {
    const ts = todayAt(10);
    const reward = LifePulsePlugin.calculateIncentive('walking', 80, { steps: 10_000, timestamp: ts });
    expect(reward.lazyCoin).toBe(0);
    expect(reward.reaction).toBeNull();
  });

  // working late (activity after 21:00) → +2
  it('awards 2 lazy coins for any activity after 21:00', () => {
    const ts = todayAt(22);
    const reward = LifePulsePlugin.calculateIncentive('running', 30, { timestamp: ts });
    expect(reward.lazyCoin).toBe(2);
    expect(reward.reaction).toBe('主人快下班！');
  });

  it('awards 2 lazy coins for activity at exactly 21:00', () => {
    const ts = todayAt(21);
    const reward = LifePulsePlugin.calculateIncentive('eating', 15, { timestamp: ts });
    expect(reward.lazyCoin).toBe(2);
    expect(reward.reaction).toBe('主人快下班！');
  });

  it('awards 0 lazy coins for activity at 20:59 (just before overtime threshold)', () => {
    const ts = todayAt(20); // 20:00 is < 21
    const reward = LifePulsePlugin.calculateIncentive('eating', 15, { timestamp: ts });
    expect(reward.lazyCoin).toBe(0);
    expect(reward.reaction).toBeNull();
  });

  // weekend idle all day → +15
  it('awards 15 lazy coins for idle >= 480 min on a weekend', () => {
    const ts = lastSaturday(10);
    const reward = LifePulsePlugin.calculateIncentive('idle', 480, { timestamp: ts });
    expect(reward.lazyCoin).toBe(15);
    expect(reward.reaction).toBe('周末就该这样');
  });

  it('awards 10 (not 15) lazy coins for idle 61 min on a weekend (< 480 min)', () => {
    const ts = lastSaturday(10);
    const reward = LifePulsePlugin.calculateIncentive('idle', 61, { timestamp: ts });
    // Falls through to the "idle > 60" rule after the weekend rule (480 min) doesn't match
    expect(reward.lazyCoin).toBe(10);
    expect(reward.reaction).toBe('人生赢家');
  });

  it('awards 0 lazy coins when no rules match', () => {
    const ts = todayAt(10);
    const reward = LifePulsePlugin.calculateIncentive('cycling', 20, { timestamp: ts });
    expect(reward.lazyCoin).toBe(0);
    expect(reward.reaction).toBeNull();
  });

  it('uses current timestamp when opts.timestamp is omitted', () => {
    // Just ensures the function doesn't throw when timestamp is absent
    expect(() =>
      LifePulsePlugin.calculateIncentive('idle', 30),
    ).not.toThrow();
  });

  it('returns an IncentiveReward shape with lazyCoin and reaction fields', () => {
    const reward: IncentiveReward = LifePulsePlugin.calculateIncentive('idle', 90, {
      timestamp: todayAt(14),
    });
    expect(typeof reward.lazyCoin).toBe('number');
    // reaction is string or null
    expect(reward.reaction === null || typeof reward.reaction === 'string').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// detectSpecialEvent
// ---------------------------------------------------------------------------

describe('LifePulsePlugin.detectSpecialEvent()', () => {
  it('returns null for an empty event list', () => {
    expect(LifePulsePlugin.detectSpecialEvent([])).toBeNull();
  });

  it('returns null when events contain no transport activities', () => {
    const events: ActivityEvent[] = [
      makeActivityEvent('idle'),
      makeActivityEvent('walking', undefined, { steps: 200 }),
    ];
    expect(LifePulsePlugin.detectSpecialEvent(events)).toBeNull();
  });

  // commute_routine — same GPS route >= 5 times
  // Use a single base timestamp so the span stays under 120 min (no long_journey).
  it('detects commute_routine when same GPS path appears 5 times', () => {
    const path: ReadonlyArray<readonly [number, number]> = [
      [31.23, 121.47],
      [31.24, 121.48],
    ];
    const base = Date.now();
    // 5 events each 1 second apart — same GPS path, total span < 120 min
    const events: ActivityEvent[] = Array.from({ length: 5 }, (_, i) =>
      makeActivityEvent('subway', base + i * 1_000, { gpsPath: path }),
    );
    const result = LifePulsePlugin.detectSpecialEvent(events);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('commute_routine');
    expect(result?.reaction).toContain('背下来了');
  });

  it('does not trigger commute_routine when path appears only 4 times', () => {
    const path: ReadonlyArray<readonly [number, number]> = [[31.23, 121.47]];
    const base = Date.now();
    const events: ActivityEvent[] = Array.from({ length: 4 }, (_, i) =>
      makeActivityEvent('subway', base + i * 1_000, { gpsPath: path }),
    );
    // Could still return another type; just ensure commute_routine is absent
    const result = LifePulsePlugin.detectSpecialEvent(events);
    expect(result?.type).not.toBe('commute_routine');
  });

  // new_route — two transport events with different GPS paths
  it('detects new_route when two transport events have different GPS paths', () => {
    const pathA: ReadonlyArray<readonly [number, number]> = [[31.23, 121.47]];
    const pathB: ReadonlyArray<readonly [number, number]> = [[31.99, 121.99]];
    const events: ActivityEvent[] = [
      makeActivityEvent('subway', Date.now(), { gpsPath: pathA }),
      makeActivityEvent('subway', Date.now() + 1_000, { gpsPath: pathB }),
    ];
    const result = LifePulsePlugin.detectSpecialEvent(events);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('new_route');
    expect(result?.reaction).toContain('张望');
  });

  // long_journey — transport duration > 120 min
  it('detects long_journey when total transport span > 120 minutes', () => {
    const twoHoursMs = 121 * 60_000;
    const events: ActivityEvent[] = [
      makeActivityEvent('train', Date.now()),
      makeActivityEvent('train', Date.now() + twoHoursMs),
    ];
    const result = LifePulsePlugin.detectSpecialEvent(events);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('long_journey');
    expect(result?.reaction).toContain('诗');
    expect((result?.metadata['durationMinutes'] as number)).toBeGreaterThan(120);
  });

  it('does not detect long_journey when transport span is exactly 120 min', () => {
    const exactlyMs = 120 * 60_000;
    const events: ActivityEvent[] = [
      makeActivityEvent('train', Date.now()),
      makeActivityEvent('train', Date.now() + exactlyMs),
    ];
    const result = LifePulsePlugin.detectSpecialEvent(events);
    expect(result?.type).not.toBe('long_journey');
  });

  // late_return — transport after 22:00
  it('detects late_return for transport event after 22:00', () => {
    const lateTs = todayAt(23);
    const events: ActivityEvent[] = [makeActivityEvent('subway', lateTs)];
    const result = LifePulsePlugin.detectSpecialEvent(events);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('late_return');
    expect(result?.reaction).toContain('睡着了');
  });

  it('does not detect late_return for transport at 21:59', () => {
    const ts = todayAt(21); // 21:00 — before threshold
    const events: ActivityEvent[] = [makeActivityEvent('subway', ts)];
    const result = LifePulsePlugin.detectSpecialEvent(events);
    expect(result?.type).not.toBe('late_return');
  });

  // traffic_jam — > 15 transport events within 15-minute window
  it('detects traffic_jam when > 15 transport events cluster within 15 minutes', () => {
    const base = Date.now();
    const events: ActivityEvent[] = Array.from({ length: 16 }, (_, i) =>
      makeActivityEvent('bus', base + i * 30_000), // 30 s apart, all within 8 min
    );
    const result = LifePulsePlugin.detectSpecialEvent(events);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('traffic_jam');
    expect(result?.reaction).toContain('掌机');
  });

  it('does not detect traffic_jam when transport events are spread far apart', () => {
    const base = Date.now();
    // 5 events, each 2 hours apart — well outside the 15-min window
    const events: ActivityEvent[] = Array.from({ length: 5 }, (_, i) =>
      makeActivityEvent('bus', base + i * 2 * 60 * 60_000),
    );
    const result = LifePulsePlugin.detectSpecialEvent(events);
    expect(result?.type).not.toBe('traffic_jam');
  });
});

// ---------------------------------------------------------------------------
// ScenePlugin interface — buildPrompt
// ---------------------------------------------------------------------------

describe('LifePulsePlugin.buildPrompt()', () => {
  const plugin = new LifePulsePlugin();

  it('returns an array with at least two messages', () => {
    const ctx = makeContext();
    const event = makeTurnEvent({ data: { activityType: 'idle' } });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages.length).toBeGreaterThanOrEqual(2);
  });

  it('first message has role "system"', () => {
    const ctx = makeContext();
    const event = makeTurnEvent({ data: { activityType: 'walking' } });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].role).toBe('system');
  });

  it('last message has role "user"', () => {
    const ctx = makeContext();
    const event = makeTurnEvent({ data: { activityType: 'walking' } });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[messages.length - 1].role).toBe('user');
  });

  it('system message includes the lobster bot id', () => {
    const ctx = makeContext('lob-99');
    const event = makeTurnEvent({ data: { activityType: 'idle' } });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].content).toContain('lob-99');
  });

  it('system message includes the current scene', () => {
    const ctx = makeContext();
    const event = makeTurnEvent({ data: { activityType: 'sleeping' } });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].content).toContain('lobster_bedroom');
  });

  it('system message includes the current action', () => {
    const ctx = makeContext();
    const event = makeTurnEvent({ data: { activityType: 'cycling' } });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].content).toContain('riding_seahorse');
  });

  it('uses custom prompt from event.data.prompt when provided', () => {
    const ctx = makeContext();
    const event = makeTurnEvent({
      data: { activityType: 'idle', prompt: '你今天感觉怎么样？' },
    });
    const messages = plugin.buildPrompt(event, ctx);
    const userMsg = messages[messages.length - 1];
    expect(userMsg.content).toBe('你今天感觉怎么样？');
  });

  it('falls back to "idle" when activityType is missing from event data', () => {
    const ctx = makeContext();
    const event = makeTurnEvent({ data: {} });
    const messages = plugin.buildPrompt(event, ctx);
    // Should not throw and system message should mention lobster_home
    expect(messages[0].content).toContain('lobster_home');
  });

  it('generates distinct user messages for different activity types', () => {
    const ctx = makeContext();
    const eventIdle = makeTurnEvent({ data: { activityType: 'idle' } });
    const eventRunning = makeTurnEvent({ data: { activityType: 'running' } });
    const msgIdle = plugin.buildPrompt(eventIdle, ctx);
    const msgRunning = plugin.buildPrompt(eventRunning, ctx);
    // The user messages should differ
    expect(msgIdle[msgIdle.length - 1].content).not.toBe(
      msgRunning[msgRunning.length - 1].content,
    );
  });
});

// ---------------------------------------------------------------------------
// ScenePlugin interface — parseAction
// ---------------------------------------------------------------------------

describe('LifePulsePlugin.parseAction()', () => {
  const plugin = new LifePulsePlugin();

  it('returns an action with type "react"', () => {
    const ctx = makeContext();
    const action = plugin.parseAction('躺着真舒服', ctx);
    expect(action.type).toBe('react');
  });

  it('preserves the response content', () => {
    const ctx = makeContext();
    const action = plugin.parseAction('今天也是美好的一天～', ctx);
    expect(action.content).toBe('今天也是美好的一天～');
  });

  it('trims leading and trailing whitespace', () => {
    const ctx = makeContext();
    const action = plugin.parseAction('  嗨  ', ctx);
    expect(action.content).toBe('嗨');
  });

  it('sets target to undefined', () => {
    const ctx = makeContext();
    const action = plugin.parseAction('好呀', ctx);
    expect(action.target).toBeUndefined();
  });

  it('metadata is an empty object', () => {
    const ctx = makeContext();
    const action = plugin.parseAction('嗨', ctx);
    expect(action.metadata).toEqual({});
  });

  it('handles empty string without throwing', () => {
    const ctx = makeContext();
    expect(() => plugin.parseAction('', ctx)).not.toThrow();
  });

  it('returns trimmed empty content for whitespace-only response', () => {
    const ctx = makeContext();
    const action = plugin.parseAction('   ', ctx);
    expect(action.content).toBe('');
  });
});

// ---------------------------------------------------------------------------
// ScenePlugin interface — validateAction
// ---------------------------------------------------------------------------

describe('LifePulsePlugin.validateAction()', () => {
  const plugin = new LifePulsePlugin();

  function makeAction(overrides: Partial<ActionSpec> = {}): ActionSpec {
    return {
      type: 'react',
      content: '躺着好',
      target: undefined,
      metadata: {},
      ...overrides,
    };
  }

  it('returns valid for a well-formed react action', () => {
    const ctx = makeContext();
    const result = plugin.validateAction(makeAction(), ctx);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('returns invalid for an unknown action type', () => {
    const ctx = makeContext();
    const result = plugin.validateAction(makeAction({ type: 'attack' }), ctx);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Unknown action type');
  });

  it('returns invalid for a react action with empty content', () => {
    const ctx = makeContext();
    const result = plugin.validateAction(makeAction({ content: '' }), ctx);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('empty');
  });

  it('returns invalid for a react action with whitespace-only content', () => {
    const ctx = makeContext();
    const result = plugin.validateAction(makeAction({ content: '   ' }), ctx);
    expect(result.valid).toBe(false);
  });

  it('returns valid for a react action with a single character', () => {
    const ctx = makeContext();
    const result = plugin.validateAction(makeAction({ content: '嗨' }), ctx);
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ScenePlugin interface — getDefaultAction
// ---------------------------------------------------------------------------

describe('LifePulsePlugin.getDefaultAction()', () => {
  const plugin = new LifePulsePlugin();

  it('returns a react action type', () => {
    const ctx = makeContext();
    const event = makeTurnEvent({ data: { activityType: 'idle' } });
    const action = plugin.getDefaultAction(event, ctx);
    expect(action.type).toBe('react');
  });

  it('includes non-empty content', () => {
    const ctx = makeContext();
    const event = makeTurnEvent({ data: { activityType: 'walking' } });
    const action = plugin.getDefaultAction(event, ctx);
    expect(action.content.length).toBeGreaterThan(0);
  });

  it('marks fallback in metadata', () => {
    const ctx = makeContext();
    const event = makeTurnEvent({ data: { activityType: 'running' } });
    const action = plugin.getDefaultAction(event, ctx);
    expect(action.metadata['fallback']).toBe(true);
  });

  it('sets target to undefined', () => {
    const ctx = makeContext();
    const event = makeTurnEvent({ data: { activityType: 'sleeping' } });
    const action = plugin.getDefaultAction(event, ctx);
    expect(action.target).toBeUndefined();
  });

  it('falls back to idle description when activityType is missing', () => {
    const ctx = makeContext();
    const event = makeTurnEvent({ data: {} });
    const action = plugin.getDefaultAction(event, ctx);
    // Should not throw; content should reference idle description
    expect(action.content).toContain('在吊床上发呆');
  });

  // Spot-check several activities to confirm descriptions are embedded
  const SPOT_CHECKS: Array<[ActivityType, string]> = [
    ['cycling',        '骑海马'],
    ['subway',         '海底隧道列车'],
    ['eating',         'comfort food'],
    ['phone_call',     '海螺'],
    ['charging',       '能量珊瑚'],
  ];

  for (const [activity, descFragment] of SPOT_CHECKS) {
    it(`default action for "${activity}" contains description fragment "${descFragment}"`, () => {
      const ctx = makeContext();
      const event = makeTurnEvent({ data: { activityType: activity } });
      const action = plugin.getDefaultAction(event, ctx);
      expect(action.content).toContain(descFragment);
    });
  }
});

// ---------------------------------------------------------------------------
// ScenePlugin interface — formatEvent
// ---------------------------------------------------------------------------

describe('LifePulsePlugin.formatEvent()', () => {
  const plugin = new LifePulsePlugin();

  function makeEvent(
    type: string,
    data: Record<string, unknown> = {},
    phase = 'active',
  ): TurnEvent {
    return {
      id: 'evt-x',
      botId: 'lob-1',
      sceneId: 'life-pulse:session-1',
      type,
      phase,
      data,
      timestamp: Date.now(),
    };
  }

  it('formats activity_update event with activity type and description', () => {
    const result = plugin.formatEvent(
      makeEvent('activity_update', { activityType: 'cycling' }),
    );
    expect(result).toContain('cycling');
    expect(result).toContain('骑海马');
  });

  it('formats activity_update for "idle" correctly', () => {
    const result = plugin.formatEvent(
      makeEvent('activity_update', { activityType: 'idle' }),
    );
    expect(result).toContain('idle');
    expect(result).toContain('在吊床上发呆');
  });

  it('falls back to idle description for activity_update missing activityType', () => {
    const result = plugin.formatEvent(makeEvent('activity_update', {}));
    expect(result).toContain('idle');
  });

  it('formats incentive_awarded with coin count and reaction', () => {
    const result = plugin.formatEvent(
      makeEvent('incentive_awarded', { lazyCoin: 10, reaction: '人生赢家' }),
    );
    expect(result).toContain('+10');
    expect(result).toContain('人生赢家');
  });

  it('formats incentive_awarded with 0 coins when data missing', () => {
    const result = plugin.formatEvent(makeEvent('incentive_awarded', {}));
    expect(result).toContain('+0');
  });

  it('formats special_event with event type and reaction', () => {
    const result = plugin.formatEvent(
      makeEvent('special_event', { eventType: 'traffic_jam', reaction: '堵车了！' }),
    );
    expect(result).toContain('traffic_jam');
    expect(result).toContain('堵车了！');
  });

  it('formats special_event with "unknown" fallback when eventType missing', () => {
    const result = plugin.formatEvent(makeEvent('special_event', {}));
    expect(result).toContain('unknown');
  });

  it('formats unknown event types as "[phase] type"', () => {
    const result = plugin.formatEvent(
      makeEvent('custom_type', {}, 'custom_phase'),
    );
    expect(result).toContain('custom_phase');
    expect(result).toContain('custom_type');
  });

  it('perspective parameter does not affect output (life-pulse is single-player)', () => {
    const event = makeEvent('activity_update', { activityType: 'idle' });
    const withPerspective = plugin.formatEvent(event, 'lob-1');
    const withoutPerspective = plugin.formatEvent(event);
    expect(withPerspective).toBe(withoutPerspective);
  });
});

// ---------------------------------------------------------------------------
// Edge cases & type safety
// ---------------------------------------------------------------------------

describe('LifePulsePlugin edge cases', () => {
  const plugin = new LifePulsePlugin();

  it('validateAction result from parseAction on empty string is invalid', () => {
    const ctx = makeContext();
    const action = plugin.parseAction('', ctx);
    const result = plugin.validateAction(action, ctx);
    expect(result.valid).toBe(false);
  });

  it('validateAction result from parseAction on a normal string is valid', () => {
    const ctx = makeContext();
    const action = plugin.parseAction('龙虾在打滚', ctx);
    const result = plugin.validateAction(action, ctx);
    expect(result.valid).toBe(true);
  });

  it('getDefaultAction produces a valid action per validateAction', () => {
    const ctx = makeContext();
    const event = makeTurnEvent({ data: { activityType: 'plane' } });
    const action = plugin.getDefaultAction(event, ctx);
    const result = plugin.validateAction(action, ctx);
    expect(result.valid).toBe(true);
  });

  it('detectSpecialEvent does not mutate the input array', () => {
    const events: ActivityEvent[] = [makeActivityEvent('subway')];
    const original = [...events];
    LifePulsePlugin.detectSpecialEvent(events);
    expect(events).toEqual(original);
  });

  it('calculateIncentive is a pure function — same inputs produce same outputs', () => {
    const ts = todayAt(14);
    const a = LifePulsePlugin.calculateIncentive('idle', 90, { timestamp: ts });
    const b = LifePulsePlugin.calculateIncentive('idle', 90, { timestamp: ts });
    expect(a).toEqual(b);
  });
});
