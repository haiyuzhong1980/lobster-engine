// @lobster-engine/core — Emotion engine for the Lobster companion product

import type { EmotionState, EmotionTrigger, EmotionType, EmotionIntensity } from './lobster-types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Calm baseline — every emotion rests here when undisturbed. */
const BASELINE = 50;

/** Natural decay rate: 2 points per hour toward baseline. */
const DECAY_RATE_PER_MS = 2 / (60 * 60 * 1000);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clamp a numeric value to the inclusive [min, max] range. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Apply a single numeric delta to one emotion field, clamped to 0-100. */
function applyDelta(current: number, delta: number): number {
  return clamp(current + delta, 0, 100);
}

/** Move a single emotion value one step closer to BASELINE by `amount`. */
function decayValue(value: number, amount: number): number {
  if (value > BASELINE) {
    return Math.max(BASELINE, value - amount);
  }
  if (value < BASELINE) {
    return Math.min(BASELINE, value + amount);
  }
  return value;
}

// ---------------------------------------------------------------------------
// EmotionEngine
// ---------------------------------------------------------------------------

export class EmotionEngine {
  /**
   * Create a default emotion state where every dimension is at 50 (calm).
   */
  static createDefault(): EmotionState {
    return {
      happy: BASELINE,
      sleepy: BASELINE,
      curious: BASELINE,
      hungry: BASELINE,
      warm: BASELINE,
      proud: BASELINE,
      surprised: BASELINE,
      zen: BASELINE,
    };
  }

  /**
   * Apply an emotion trigger to a state and return a new, clamped state.
   * The original state is never mutated.
   */
  static applyTrigger(state: EmotionState, trigger: EmotionTrigger): EmotionState {
    const changes = trigger.changes;
    return {
      happy: applyDelta(state.happy, changes.happy ?? 0),
      sleepy: applyDelta(state.sleepy, changes.sleepy ?? 0),
      curious: applyDelta(state.curious, changes.curious ?? 0),
      hungry: applyDelta(state.hungry, changes.hungry ?? 0),
      warm: applyDelta(state.warm, changes.warm ?? 0),
      proud: applyDelta(state.proud, changes.proud ?? 0),
      surprised: applyDelta(state.surprised, changes.surprised ?? 0),
      zen: applyDelta(state.zen, changes.zen ?? 0),
    };
  }

  /**
   * Decay all emotions toward the calm baseline (50) at a rate of 2 per hour.
   * `elapsedMs` is the number of milliseconds that have passed.
   * Returns a new state; the original is never mutated.
   */
  static decay(state: EmotionState, elapsedMs: number): EmotionState {
    const amount = elapsedMs * DECAY_RATE_PER_MS;
    return {
      happy: decayValue(state.happy, amount),
      sleepy: decayValue(state.sleepy, amount),
      curious: decayValue(state.curious, amount),
      hungry: decayValue(state.hungry, amount),
      warm: decayValue(state.warm, amount),
      proud: decayValue(state.proud, amount),
      surprised: decayValue(state.surprised, amount),
      zen: decayValue(state.zen, amount),
    };
  }

  /**
   * Return the dominant emotion — the one with the largest absolute deviation
   * from the calm baseline (50). Ties are broken by key insertion order.
   */
  static getDominant(state: EmotionState): {
    type: EmotionType;
    intensity: EmotionIntensity;
    value: number;
  } {
    const keys: readonly EmotionType[] = [
      'happy', 'sleepy', 'curious', 'hungry',
      'warm', 'proud', 'surprised', 'zen',
    ];

    let dominantType: EmotionType = keys[0];
    let dominantValue: number = state[keys[0]];
    let dominantDeviation: number = Math.abs(dominantValue - BASELINE);

    for (let i = 1; i < keys.length; i++) {
      const key = keys[i];
      const value = state[key];
      const deviation = Math.abs(value - BASELINE);
      if (deviation > dominantDeviation) {
        dominantType = key;
        dominantValue = value;
        dominantDeviation = deviation;
      }
    }

    return {
      type: dominantType,
      intensity: EmotionEngine.getIntensity(dominantValue),
      value: dominantValue,
    };
  }

  /**
   * Classify a raw 0-100 emotion value into an intensity level:
   *  - low:  deviation from 50 is  0–16
   *  - mid:  deviation from 50 is 17–33
   *  - high: deviation from 50 is 34–50
   */
  static getIntensity(value: number): EmotionIntensity {
    const deviation = Math.abs(value - BASELINE);
    if (deviation >= 34) return 'high';
    if (deviation >= 17) return 'mid';
    return 'low';
  }

  // ---------------------------------------------------------------------------
  // Predefined triggers
  // ---------------------------------------------------------------------------

  static readonly TRIGGERS: Record<string, EmotionTrigger> = {
    /** User opens the app after a normal gap. */
    app_open: {
      type: 'app_open',
      changes: { happy: +8, curious: +5, surprised: +3 },
    },

    /** User returns after a long absence (>24 h). */
    long_absence_return: {
      type: 'long_absence_return',
      changes: { happy: +15, surprised: +10, hungry: +10 },
    },

    /** Owner is out walking. */
    walking: {
      type: 'walking',
      changes: { curious: +6, happy: +4 },
    },

    /** Owner has been idle for an extended period. */
    idle: {
      type: 'idle',
      changes: { zen: +8, sleepy: +6 },
    },

    /** Owner photographs food — the lobster smells something good. */
    food_photo: {
      type: 'food_photo',
      changes: { hungry: +12, happy: +5 },
    },

    /** Encounter with an extroverted lobster. */
    encounter_extrovert: {
      type: 'encounter_extrovert',
      changes: { happy: +10, curious: +8, surprised: +5 },
    },

    /** Encounter with an introverted lobster. */
    encounter_introvert: {
      type: 'encounter_introvert',
      changes: { curious: +6, zen: +4 },
    },

    /** Owner places a new decoration in the lobster's home. */
    new_decoration: {
      type: 'new_decoration',
      changes: { happy: +12, curious: +10, surprised: +6 },
    },

    /** Lobster has not been visited for three days. */
    three_days_absence: {
      type: 'three_days_absence',
      changes: { hungry: +20, sleepy: +10, happy: -15 },
    },

    /** It is deep night (00:00–04:00). */
    deep_night: {
      type: 'deep_night',
      changes: { sleepy: +15, zen: +5 },
    },

    /** Weather is clear and pleasant. */
    good_weather: {
      type: 'good_weather',
      changes: { happy: +8, warm: +6, curious: +4 },
    },

    /** It is raining outside. */
    rain: {
      type: 'rain',
      changes: { sleepy: +8, zen: +6, warm: +4 },
    },
  } as const;
}
