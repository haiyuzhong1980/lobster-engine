// @lobster-engine/core — PersonalityEngine tests

import { describe, it, expect } from 'vitest';
import { PersonalityEngine } from '../personality.js';
import type { PersonalityDNA, PersonalityDrift } from '../lobster-types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dna(overrides: Partial<PersonalityDNA> = {}): PersonalityDNA {
  return {
    introversion_extroversion: 0,
    laziness_curiosity: 0,
    emotional_rational: 0,
    talkative_silent: 0,
    foodie_ascetic: 0,
    nightowl_earlybird: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createDefault
// ---------------------------------------------------------------------------

describe('PersonalityEngine.createDefault', () => {
  it('returns a PersonalityDNA with all traits at 0', () => {
    const p = PersonalityEngine.createDefault();
    expect(p.introversion_extroversion).toBe(0);
    expect(p.laziness_curiosity).toBe(0);
    expect(p.emotional_rational).toBe(0);
    expect(p.talkative_silent).toBe(0);
    expect(p.foodie_ascetic).toBe(0);
    expect(p.nightowl_earlybird).toBe(0);
  });

  it('returns a new object each call', () => {
    const a = PersonalityEngine.createDefault();
    const b = PersonalityEngine.createDefault();
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// applyDrift
// ---------------------------------------------------------------------------

describe('PersonalityEngine.applyDrift', () => {
  it('applies a single drift correctly', () => {
    const base = dna({ nightowl_earlybird: 10 });
    const drifts: PersonalityDrift[] = [
      { trait: 'nightowl_earlybird', delta: 2, reason: 'test' },
    ];
    const result = PersonalityEngine.applyDrift(base, drifts);
    expect(result.nightowl_earlybird).toBe(12);
  });

  it('applies multiple drifts across different traits', () => {
    const base = dna({ foodie_ascetic: 5, social: 0 } as unknown as Partial<PersonalityDNA>);
    const realBase = dna({ foodie_ascetic: 5, introversion_extroversion: 0 });
    const drifts: PersonalityDrift[] = [
      { trait: 'foodie_ascetic', delta: 3, reason: 'food photos' },
      { trait: 'introversion_extroversion', delta: -2, reason: 'lonely week' },
    ];
    const result = PersonalityEngine.applyDrift(realBase, drifts);
    expect(result.foodie_ascetic).toBe(8);
    expect(result.introversion_extroversion).toBe(-2);
  });

  it('clamps individual drift deltas to ±3', () => {
    const base = dna({ foodie_ascetic: 0 });
    const drifts: PersonalityDrift[] = [
      { trait: 'foodie_ascetic', delta: 10, reason: 'over limit' },
    ];
    const result = PersonalityEngine.applyDrift(base, drifts);
    expect(result.foodie_ascetic).toBe(3);
  });

  it('clamps negative drift to -3', () => {
    const base = dna({ laziness_curiosity: 0 });
    const drifts: PersonalityDrift[] = [
      { trait: 'laziness_curiosity', delta: -99, reason: 'extreme' },
    ];
    const result = PersonalityEngine.applyDrift(base, drifts);
    expect(result.laziness_curiosity).toBe(-3);
  });

  it('clamps resulting trait value to 100 maximum', () => {
    const base = dna({ nightowl_earlybird: 99 });
    const drifts: PersonalityDrift[] = [
      { trait: 'nightowl_earlybird', delta: 3, reason: 'overflow' },
    ];
    const result = PersonalityEngine.applyDrift(base, drifts);
    expect(result.nightowl_earlybird).toBe(100);
  });

  it('clamps resulting trait value to -100 minimum', () => {
    const base = dna({ nightowl_earlybird: -99 });
    const drifts: PersonalityDrift[] = [
      { trait: 'nightowl_earlybird', delta: -3, reason: 'underflow' },
    ];
    const result = PersonalityEngine.applyDrift(base, drifts);
    expect(result.nightowl_earlybird).toBe(-100);
  });

  it('does not mutate the original personality', () => {
    const base = dna({ foodie_ascetic: 10 });
    const drifts: PersonalityDrift[] = [
      { trait: 'foodie_ascetic', delta: 3, reason: 'test' },
    ];
    PersonalityEngine.applyDrift(base, drifts);
    expect(base.foodie_ascetic).toBe(10);
  });

  it('returns original values unchanged when drifts list is empty', () => {
    const base = dna({ talkative_silent: 42 });
    const result = PersonalityEngine.applyDrift(base, []);
    expect(result.talkative_silent).toBe(42);
    expect(result).not.toBe(base);
  });
});

// ---------------------------------------------------------------------------
// calculateDrifts
// ---------------------------------------------------------------------------

describe('PersonalityEngine.calculateDrifts', () => {
  it('returns no drifts for a neutral week', () => {
    const stats = {
      lateNightActiveDays: 2,
      newLocationsVisited: 2,
      socialEncounters: 3,
      lowStepDays: 2,
      foodPhotos: 2,
      appUsageMinutesPerDay: 60,
      channelMessagesPerDay: 5,
    };
    const drifts = PersonalityEngine.calculateDrifts(stats);
    expect(drifts).toHaveLength(0);
  });

  it('detects night-owl behaviour when lateNightActiveDays >= 4', () => {
    const stats = {
      lateNightActiveDays: 5,
      newLocationsVisited: 0,
      socialEncounters: 0,
      lowStepDays: 0,
      foodPhotos: 0,
      appUsageMinutesPerDay: 30,
      channelMessagesPerDay: 5,
    };
    const drifts = PersonalityEngine.calculateDrifts(stats);
    const nightDrift = drifts.find((d) => d.trait === 'nightowl_earlybird');
    expect(nightDrift).toBeDefined();
    expect(nightDrift?.delta).toBe(2);
  });

  it('detects early-bird behaviour when lateNightActiveDays <= 1', () => {
    const stats = {
      lateNightActiveDays: 0,
      newLocationsVisited: 0,
      socialEncounters: 3,
      lowStepDays: 0,
      foodPhotos: 0,
      appUsageMinutesPerDay: 30,
      channelMessagesPerDay: 5,
    };
    const drifts = PersonalityEngine.calculateDrifts(stats);
    const nightDrift = drifts.find((d) => d.trait === 'nightowl_earlybird');
    expect(nightDrift?.delta).toBe(-1);
  });

  it('applies social extroversion drift for many encounters', () => {
    const stats = {
      lateNightActiveDays: 2,
      newLocationsVisited: 0,
      socialEncounters: 7,
      lowStepDays: 0,
      foodPhotos: 0,
      appUsageMinutesPerDay: 30,
      channelMessagesPerDay: 5,
    };
    const drifts = PersonalityEngine.calculateDrifts(stats);
    const social = drifts.find((d) => d.trait === 'introversion_extroversion');
    expect(social?.delta).toBe(2);
  });

  it('applies introversion drift for very few encounters', () => {
    const stats = {
      lateNightActiveDays: 2,
      newLocationsVisited: 0,
      socialEncounters: 1,
      lowStepDays: 0,
      foodPhotos: 0,
      appUsageMinutesPerDay: 30,
      channelMessagesPerDay: 5,
    };
    const drifts = PersonalityEngine.calculateDrifts(stats);
    const social = drifts.find((d) => d.trait === 'introversion_extroversion');
    expect(social?.delta).toBe(-1);
  });

  it('applies talkative drift for high message rate', () => {
    const stats = {
      lateNightActiveDays: 2,
      newLocationsVisited: 0,
      socialEncounters: 3,
      lowStepDays: 0,
      foodPhotos: 0,
      appUsageMinutesPerDay: 30,
      channelMessagesPerDay: 15,
    };
    const drifts = PersonalityEngine.calculateDrifts(stats);
    const talk = drifts.find((d) => d.trait === 'talkative_silent');
    expect(talk?.delta).toBe(2);
  });

  it('applies sedentary drift when lowStepDays >= 5', () => {
    const stats = {
      lateNightActiveDays: 2,
      newLocationsVisited: 0,
      socialEncounters: 3,
      lowStepDays: 6,
      foodPhotos: 0,
      appUsageMinutesPerDay: 30,
      channelMessagesPerDay: 5,
    };
    const drifts = PersonalityEngine.calculateDrifts(stats);
    const lazy = drifts.find((d) => d.trait === 'laziness_curiosity' && d.delta === -2);
    expect(lazy).toBeDefined();
  });

  it('applies explorer drift when newLocationsVisited >= 4', () => {
    const stats = {
      lateNightActiveDays: 2,
      newLocationsVisited: 5,
      socialEncounters: 3,
      lowStepDays: 0,
      foodPhotos: 0,
      appUsageMinutesPerDay: 30,
      channelMessagesPerDay: 5,
    };
    const drifts = PersonalityEngine.calculateDrifts(stats);
    const explore = drifts.find((d) => d.trait === 'laziness_curiosity' && d.delta === 2);
    expect(explore).toBeDefined();
  });

  it('applies foodie drift when foodPhotos >= 5', () => {
    const stats = {
      lateNightActiveDays: 2,
      newLocationsVisited: 0,
      socialEncounters: 3,
      lowStepDays: 0,
      foodPhotos: 7,
      appUsageMinutesPerDay: 30,
      channelMessagesPerDay: 5,
    };
    const drifts = PersonalityEngine.calculateDrifts(stats);
    const foodie = drifts.find((d) => d.trait === 'foodie_ascetic');
    expect(foodie?.delta).toBe(2);
  });

  it('applies screen-laziness drift when appUsageMinutesPerDay >= 120', () => {
    const stats = {
      lateNightActiveDays: 2,
      newLocationsVisited: 0,
      socialEncounters: 3,
      lowStepDays: 0,
      foodPhotos: 0,
      appUsageMinutesPerDay: 180,
      channelMessagesPerDay: 5,
    };
    const drifts = PersonalityEngine.calculateDrifts(stats);
    const screen = drifts.find(
      (d) => d.trait === 'laziness_curiosity' && d.delta === -1,
    );
    expect(screen).toBeDefined();
  });

  it('returns readonly-compatible array', () => {
    const stats = {
      lateNightActiveDays: 5,
      newLocationsVisited: 0,
      socialEncounters: 0,
      lowStepDays: 0,
      foodPhotos: 0,
      appUsageMinutesPerDay: 30,
      channelMessagesPerDay: 5,
    };
    const drifts = PersonalityEngine.calculateDrifts(stats);
    expect(Array.isArray(drifts)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// calculateMatch
// ---------------------------------------------------------------------------

describe('PersonalityEngine.calculateMatch', () => {
  it('returns a number between 0 and 100', () => {
    const a = PersonalityEngine.createDefault();
    const b = PersonalityEngine.createDefault();
    const score = PersonalityEngine.calculateMatch(a, b);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('identical personalities produce a high score', () => {
    const p = dna({ foodie_ascetic: 60, nightowl_earlybird: 50 });
    const score = PersonalityEngine.calculateMatch(p, p);
    expect(score).toBeGreaterThanOrEqual(50);
  });

  it('complementary social personalities score reasonably well', () => {
    const introvert = dna({ introversion_extroversion: -60 });
    const extrovert = dna({ introversion_extroversion: 60 });
    const score = PersonalityEngine.calculateMatch(introvert, extrovert);
    // Should receive the complementary bonus
    expect(score).toBeGreaterThan(20);
  });

  it('two foodies share a passion bonus', () => {
    const a = dna({ foodie_ascetic: 80 });
    const b = dna({ foodie_ascetic: 70 });
    const neutral = dna();
    const foodyScore = PersonalityEngine.calculateMatch(a, b);
    const neutralScore = PersonalityEngine.calculateMatch(neutral, neutral);
    // Foodies should score higher due to shared passion
    expect(foodyScore).toBeGreaterThanOrEqual(neutralScore);
  });

  it('is symmetric — match(a,b) equals match(b,a)', () => {
    const a = dna({ introversion_extroversion: 40, foodie_ascetic: -20 });
    const b = dna({ introversion_extroversion: -30, nightowl_earlybird: 50 });
    expect(PersonalityEngine.calculateMatch(a, b)).toBe(
      PersonalityEngine.calculateMatch(b, a),
    );
  });

  it('returns an integer', () => {
    const a = dna({ laziness_curiosity: 33 });
    const b = dna({ laziness_curiosity: -17 });
    const score = PersonalityEngine.calculateMatch(a, b);
    expect(Number.isInteger(score)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getArchetype
// ---------------------------------------------------------------------------

describe('PersonalityEngine.getArchetype', () => {
  it('returns a non-empty string', () => {
    const p = PersonalityEngine.createDefault();
    expect(typeof PersonalityEngine.getArchetype(p)).toBe('string');
    expect(PersonalityEngine.getArchetype(p).length).toBeGreaterThan(0);
  });

  it('identifies an extrovert', () => {
    const p = dna({ introversion_extroversion: 80 });
    const name = PersonalityEngine.getArchetype(p);
    expect(name).toContain('外向');
  });

  it('identifies an introvert', () => {
    const p = dna({ introversion_extroversion: -80 });
    const name = PersonalityEngine.getArchetype(p);
    expect(name).toContain('内向');
  });

  it('identifies a night owl', () => {
    const p = dna({ nightowl_earlybird: 60 });
    const name = PersonalityEngine.getArchetype(p);
    expect(name).toContain('夜猫');
  });

  it('identifies a foodie', () => {
    const p = dna({ foodie_ascetic: 70 });
    const name = PersonalityEngine.getArchetype(p);
    expect(name).toContain('贪吃');
  });

  it('returns different archetypes for different dominant traits', () => {
    const foodie = dna({ foodie_ascetic: 90 });
    const nightOwl = dna({ nightowl_earlybird: 90 });
    expect(PersonalityEngine.getArchetype(foodie)).not.toBe(
      PersonalityEngine.getArchetype(nightOwl),
    );
  });
});

// ---------------------------------------------------------------------------
// getDialogueStyle
// ---------------------------------------------------------------------------

describe('PersonalityEngine.getDialogueStyle', () => {
  it('returns all required fields', () => {
    const style = PersonalityEngine.getDialogueStyle(PersonalityEngine.createDefault());
    expect(style.verbosity).toBeDefined();
    expect(style.tone).toBeDefined();
    expect(style.greeting).toBeDefined();
    expect(style.farewell).toBeDefined();
    expect(style.responseToCompliment).toBeDefined();
  });

  it('returns verbose style for a very talkative personality', () => {
    const p = dna({ talkative_silent: 80 });
    const style = PersonalityEngine.getDialogueStyle(p);
    expect(style.verbosity).toBe('verbose');
  });

  it('returns minimal style for a very silent personality', () => {
    const p = dna({ talkative_silent: -80 });
    const style = PersonalityEngine.getDialogueStyle(p);
    expect(style.verbosity).toBe('minimal');
  });

  it('returns normal verbosity for a neutral personality', () => {
    const p = PersonalityEngine.createDefault();
    const style = PersonalityEngine.getDialogueStyle(p);
    expect(style.verbosity).toBe('normal');
  });

  it('returns foodie tone for a strong foodie personality', () => {
    const p = dna({ foodie_ascetic: 80 });
    const style = PersonalityEngine.getDialogueStyle(p);
    expect(style.tone).toBe('foodie');
  });

  it('returns social tone for a strong extrovert', () => {
    const p = dna({ introversion_extroversion: 80 });
    const style = PersonalityEngine.getDialogueStyle(p);
    expect(style.tone).toBe('social');
  });

  it('returns quiet tone for a strong introvert', () => {
    const p = dna({ introversion_extroversion: -80 });
    const style = PersonalityEngine.getDialogueStyle(p);
    expect(style.tone).toBe('quiet');
  });

  it('returns curious tone for a highly curious personality', () => {
    const p = dna({ laziness_curiosity: 80 });
    const style = PersonalityEngine.getDialogueStyle(p);
    expect(style.tone).toBe('curious');
  });

  it('greeting and farewell are non-empty strings', () => {
    const p = dna({ foodie_ascetic: 60 });
    const style = PersonalityEngine.getDialogueStyle(p);
    expect(style.greeting.length).toBeGreaterThan(0);
    expect(style.farewell.length).toBeGreaterThan(0);
  });

  it('verbosity values are one of the allowed literals', () => {
    const p = PersonalityEngine.createDefault();
    const style = PersonalityEngine.getDialogueStyle(p);
    expect(['minimal', 'normal', 'verbose']).toContain(style.verbosity);
  });

  it('tone values are one of the allowed literals', () => {
    const p = PersonalityEngine.createDefault();
    const style = PersonalityEngine.getDialogueStyle(p);
    expect(['philosophical', 'foodie', 'social', 'quiet', 'curious', 'neutral']).toContain(
      style.tone,
    );
  });
});
