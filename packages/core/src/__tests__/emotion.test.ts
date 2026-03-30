// @lobster-engine/core — EmotionEngine tests

import { describe, it, expect } from 'vitest';
import { EmotionEngine } from '../emotion.js';
import type { EmotionState, EmotionTrigger, EmotionType } from '../lobster-types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** All 8 emotion keys in declaration order. */
const EMOTION_KEYS: readonly EmotionType[] = [
  'happy', 'sleepy', 'curious', 'hungry',
  'warm', 'proud', 'surprised', 'zen',
];

/** Assert every field equals expected (strict). */
function expectState(actual: EmotionState, expected: EmotionState): void {
  for (const key of EMOTION_KEYS) {
    expect(actual[key], `emotion '${key}'`).toBe(expected[key]);
  }
}

// ---------------------------------------------------------------------------
// createDefault
// ---------------------------------------------------------------------------

describe('EmotionEngine.createDefault', () => {
  it('returns a state where every emotion is exactly 50', () => {
    const state = EmotionEngine.createDefault();
    for (const key of EMOTION_KEYS) {
      expect(state[key]).toBe(50);
    }
  });

  it('returns a new object on each call (not the same reference)', () => {
    const a = EmotionEngine.createDefault();
    const b = EmotionEngine.createDefault();
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// applyTrigger
// ---------------------------------------------------------------------------

describe('EmotionEngine.applyTrigger', () => {
  it('increases the specified emotion by the given delta', () => {
    const state = EmotionEngine.createDefault();
    const trigger: EmotionTrigger = { type: 'test', changes: { happy: +20 } };
    const next = EmotionEngine.applyTrigger(state, trigger);
    expect(next.happy).toBe(70);
  });

  it('decreases the specified emotion by the given delta', () => {
    const state = EmotionEngine.createDefault();
    const trigger: EmotionTrigger = { type: 'test', changes: { happy: -20 } };
    const next = EmotionEngine.applyTrigger(state, trigger);
    expect(next.happy).toBe(30);
  });

  it('leaves untouched emotions unchanged', () => {
    const state = EmotionEngine.createDefault();
    const trigger: EmotionTrigger = { type: 'test', changes: { happy: +10 } };
    const next = EmotionEngine.applyTrigger(state, trigger);
    for (const key of EMOTION_KEYS) {
      if (key !== 'happy') {
        expect(next[key]).toBe(50);
      }
    }
  });

  it('clamps values at 100 when delta pushes above ceiling', () => {
    const state = EmotionEngine.createDefault();
    const trigger: EmotionTrigger = { type: 'test', changes: { curious: +9999 } };
    const next = EmotionEngine.applyTrigger(state, trigger);
    expect(next.curious).toBe(100);
  });

  it('clamps values at 0 when delta pushes below floor', () => {
    const state = EmotionEngine.createDefault();
    const trigger: EmotionTrigger = { type: 'test', changes: { curious: -9999 } };
    const next = EmotionEngine.applyTrigger(state, trigger);
    expect(next.curious).toBe(0);
  });

  it('does not mutate the original state', () => {
    const state = EmotionEngine.createDefault();
    const frozen = { ...state };
    const trigger: EmotionTrigger = { type: 'test', changes: { happy: +30 } };
    EmotionEngine.applyTrigger(state, trigger);
    expectState(state, frozen as EmotionState);
  });

  it('applies changes to multiple emotions simultaneously', () => {
    const state = EmotionEngine.createDefault();
    const trigger: EmotionTrigger = {
      type: 'test',
      changes: { happy: +10, sleepy: -5, zen: +20 },
    };
    const next = EmotionEngine.applyTrigger(state, trigger);
    expect(next.happy).toBe(60);
    expect(next.sleepy).toBe(45);
    expect(next.zen).toBe(70);
    // Untouched
    expect(next.curious).toBe(50);
    expect(next.hungry).toBe(50);
  });

  it('handles zero-delta changes without altering the value', () => {
    const state = EmotionEngine.createDefault();
    const trigger: EmotionTrigger = { type: 'test', changes: { happy: 0 } };
    const next = EmotionEngine.applyTrigger(state, trigger);
    expect(next.happy).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Multiple triggers stacking
// ---------------------------------------------------------------------------

describe('multiple triggers stacking', () => {
  it('accumulates effect of two sequential triggers on the same emotion', () => {
    const base = EmotionEngine.createDefault();
    const t1: EmotionTrigger = { type: 'a', changes: { happy: +15 } };
    const t2: EmotionTrigger = { type: 'b', changes: { happy: +10 } };
    const after1 = EmotionEngine.applyTrigger(base, t1);
    const after2 = EmotionEngine.applyTrigger(after1, t2);
    expect(after2.happy).toBe(75);
  });

  it('stacking beyond 100 is clamped', () => {
    let state = EmotionEngine.createDefault();
    const t: EmotionTrigger = { type: 'boost', changes: { proud: +30 } };
    // 50 + 30 + 30 + 30 = 140 → clamped at 100
    state = EmotionEngine.applyTrigger(state, t);
    state = EmotionEngine.applyTrigger(state, t);
    state = EmotionEngine.applyTrigger(state, t);
    expect(state.proud).toBe(100);
  });

  it('stacking below 0 is clamped', () => {
    let state = EmotionEngine.createDefault();
    const t: EmotionTrigger = { type: 'drain', changes: { warm: -30 } };
    // 50 - 30 - 30 = -10 → clamped at 0
    state = EmotionEngine.applyTrigger(state, t);
    state = EmotionEngine.applyTrigger(state, t);
    expect(state.warm).toBe(0);
  });

  it('independent emotions do not interfere when stacking multiple triggers', () => {
    let state = EmotionEngine.createDefault();
    state = EmotionEngine.applyTrigger(state, { type: 'a', changes: { happy: +10 } });
    state = EmotionEngine.applyTrigger(state, { type: 'b', changes: { zen: +20 } });
    expect(state.happy).toBe(60);
    expect(state.zen).toBe(70);
    expect(state.curious).toBe(50); // untouched
  });
});

// ---------------------------------------------------------------------------
// decay
// ---------------------------------------------------------------------------

describe('EmotionEngine.decay', () => {
  it('moves a high value closer to 50 after elapsed time', () => {
    const state: EmotionState = {
      ...EmotionEngine.createDefault(),
      happy: 80,
    };
    // 1 hour → 2-point decay
    const next = EmotionEngine.decay(state, 60 * 60 * 1000);
    expect(next.happy).toBe(78);
  });

  it('moves a low value closer to 50 after elapsed time', () => {
    const state: EmotionState = {
      ...EmotionEngine.createDefault(),
      hungry: 20,
    };
    // 1 hour → 2-point decay toward 50
    const next = EmotionEngine.decay(state, 60 * 60 * 1000);
    expect(next.hungry).toBe(22);
  });

  it('does not overshoot the baseline (high side)', () => {
    const state: EmotionState = {
      ...EmotionEngine.createDefault(),
      sleepy: 51,
    };
    // 24 hours → would decay 48 points, but must stop at 50
    const next = EmotionEngine.decay(state, 24 * 60 * 60 * 1000);
    expect(next.sleepy).toBe(50);
  });

  it('does not overshoot the baseline (low side)', () => {
    const state: EmotionState = {
      ...EmotionEngine.createDefault(),
      zen: 49,
    };
    const next = EmotionEngine.decay(state, 24 * 60 * 60 * 1000);
    expect(next.zen).toBe(50);
  });

  it('leaves a value already at 50 unchanged', () => {
    const state = EmotionEngine.createDefault();
    const next = EmotionEngine.decay(state, 60 * 60 * 1000);
    expect(next.happy).toBe(50);
  });

  it('zero elapsed time produces no change', () => {
    const state: EmotionState = { ...EmotionEngine.createDefault(), curious: 90 };
    const next = EmotionEngine.decay(state, 0);
    expect(next.curious).toBe(90);
  });

  it('does not mutate the original state', () => {
    const state: EmotionState = { ...EmotionEngine.createDefault(), happy: 80 };
    const frozen = { ...state };
    EmotionEngine.decay(state, 60 * 60 * 1000);
    expectState(state, frozen as EmotionState);
  });

  it('decays proportionally: 30 minutes produces ~1-point decay', () => {
    const state: EmotionState = { ...EmotionEngine.createDefault(), proud: 60 };
    const next = EmotionEngine.decay(state, 30 * 60 * 1000); // 30 min
    // 2/hour × 0.5h = 1.0 → 60 - 1 = 59
    expect(next.proud).toBe(59);
  });
});

// ---------------------------------------------------------------------------
// getIntensity
// ---------------------------------------------------------------------------

describe('EmotionEngine.getIntensity', () => {
  it('returns "low" for values with deviation 0-16 from 50', () => {
    expect(EmotionEngine.getIntensity(50)).toBe('low');
    expect(EmotionEngine.getIntensity(55)).toBe('low');
    expect(EmotionEngine.getIntensity(45)).toBe('low');
    expect(EmotionEngine.getIntensity(66)).toBe('low');  // deviation = 16
    expect(EmotionEngine.getIntensity(34)).toBe('low');  // deviation = 16
  });

  it('returns "mid" for values with deviation 17-33 from 50', () => {
    expect(EmotionEngine.getIntensity(67)).toBe('mid');  // deviation = 17
    expect(EmotionEngine.getIntensity(33)).toBe('mid');  // deviation = 17
    expect(EmotionEngine.getIntensity(80)).toBe('mid');  // deviation = 30
    expect(EmotionEngine.getIntensity(17)).toBe('mid');  // deviation = 33
    expect(EmotionEngine.getIntensity(83)).toBe('mid');  // deviation = 33
  });

  it('returns "high" for values with deviation >= 34 from 50', () => {
    expect(EmotionEngine.getIntensity(84)).toBe('high'); // deviation = 34
    expect(EmotionEngine.getIntensity(16)).toBe('high'); // deviation = 34
    expect(EmotionEngine.getIntensity(100)).toBe('high');
    expect(EmotionEngine.getIntensity(0)).toBe('high');
  });
});

// ---------------------------------------------------------------------------
// getDominant
// ---------------------------------------------------------------------------

describe('EmotionEngine.getDominant', () => {
  it('returns any emotion with "low" intensity when all are at baseline', () => {
    const state = EmotionEngine.createDefault();
    const result = EmotionEngine.getDominant(state);
    expect(result.intensity).toBe('low');
    expect(result.value).toBe(50);
  });

  it('returns the emotion with the largest positive deviation', () => {
    const state: EmotionState = {
      ...EmotionEngine.createDefault(),
      happy: 90,
      zen: 75,
    };
    const result = EmotionEngine.getDominant(state);
    expect(result.type).toBe('happy');
    expect(result.value).toBe(90);
  });

  it('returns the emotion with the largest negative deviation', () => {
    const state: EmotionState = {
      ...EmotionEngine.createDefault(),
      hungry: 5,
      sleepy: 30,
    };
    const result = EmotionEngine.getDominant(state);
    expect(result.type).toBe('hungry');
    expect(result.value).toBe(5);
  });

  it('prefers a higher deviation over a lower one regardless of direction', () => {
    const state: EmotionState = {
      ...EmotionEngine.createDefault(),
      happy: 90,   // deviation = 40 (positive)
      zen: 5,      // deviation = 45 (negative) — should win
    };
    const result = EmotionEngine.getDominant(state);
    expect(result.type).toBe('zen');
    expect(result.value).toBe(5);
  });

  it('returns correct intensity for the dominant emotion', () => {
    const state: EmotionState = {
      ...EmotionEngine.createDefault(),
      curious: 95, // deviation = 45 → high
    };
    const result = EmotionEngine.getDominant(state);
    expect(result.type).toBe('curious');
    expect(result.intensity).toBe('high');
  });

  it('returns mid intensity when dominant deviation is in mid range', () => {
    const state: EmotionState = {
      ...EmotionEngine.createDefault(),
      warm: 75, // deviation = 25 → mid
    };
    const result = EmotionEngine.getDominant(state);
    expect(result.type).toBe('warm');
    expect(result.intensity).toBe('mid');
  });
});

// ---------------------------------------------------------------------------
// Predefined TRIGGERS
// ---------------------------------------------------------------------------

describe('EmotionEngine.TRIGGERS', () => {
  const triggerNames = Object.keys(EmotionEngine.TRIGGERS);

  it('defines at least 12 predefined triggers', () => {
    expect(triggerNames.length).toBeGreaterThanOrEqual(12);
  });

  it.each(triggerNames)('trigger "%s" has a non-empty type string', (name) => {
    const trigger = EmotionEngine.TRIGGERS[name];
    expect(typeof trigger.type).toBe('string');
    expect(trigger.type.length).toBeGreaterThan(0);
  });

  it.each(triggerNames)('trigger "%s" has at least one emotion change', (name) => {
    const trigger = EmotionEngine.TRIGGERS[name];
    expect(Object.keys(trigger.changes).length).toBeGreaterThan(0);
  });

  it.each(triggerNames)('trigger "%s" only references valid EmotionType keys', (name) => {
    const trigger = EmotionEngine.TRIGGERS[name];
    for (const key of Object.keys(trigger.changes)) {
      expect(EMOTION_KEYS).toContain(key as EmotionType);
    }
  });

  it.each(triggerNames)('applying trigger "%s" to default state keeps values in 0-100', (name) => {
    const trigger = EmotionEngine.TRIGGERS[name];
    const state = EmotionEngine.createDefault();
    const next = EmotionEngine.applyTrigger(state, trigger);
    for (const key of EMOTION_KEYS) {
      expect(next[key]).toBeGreaterThanOrEqual(0);
      expect(next[key]).toBeLessThanOrEqual(100);
    }
  });

  it('app_open increases happy, curious, and surprised', () => {
    const state = EmotionEngine.createDefault();
    const next = EmotionEngine.applyTrigger(state, EmotionEngine.TRIGGERS.app_open);
    expect(next.happy).toBeGreaterThan(50);
    expect(next.curious).toBeGreaterThan(50);
    expect(next.surprised).toBeGreaterThan(50);
  });

  it('three_days_absence decreases happy and increases hungry and sleepy', () => {
    const state = EmotionEngine.createDefault();
    const next = EmotionEngine.applyTrigger(state, EmotionEngine.TRIGGERS.three_days_absence);
    expect(next.happy).toBeLessThan(50);
    expect(next.hungry).toBeGreaterThan(50);
    expect(next.sleepy).toBeGreaterThan(50);
  });

  it('good_weather increases happy, warm, and curious', () => {
    const state = EmotionEngine.createDefault();
    const next = EmotionEngine.applyTrigger(state, EmotionEngine.TRIGGERS.good_weather);
    expect(next.happy).toBeGreaterThan(50);
    expect(next.warm).toBeGreaterThan(50);
    expect(next.curious).toBeGreaterThan(50);
  });

  it('rain increases sleepy, zen, and warm', () => {
    const state = EmotionEngine.createDefault();
    const next = EmotionEngine.applyTrigger(state, EmotionEngine.TRIGGERS.rain);
    expect(next.sleepy).toBeGreaterThan(50);
    expect(next.zen).toBeGreaterThan(50);
    expect(next.warm).toBeGreaterThan(50);
  });
});
