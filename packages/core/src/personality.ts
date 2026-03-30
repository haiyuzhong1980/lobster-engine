// @lobster-engine/core — A.3 Personality DNA Engine

import type { PersonalityDNA, PersonalityTrait, PersonalityDrift } from './lobster-types.js';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface WeeklyBehaviorStats {
  /** Days active between 22:00 and 04:00 */
  readonly lateNightActiveDays: number;
  readonly newLocationsVisited: number;
  readonly socialEncounters: number;
  /** Days with fewer than 1 000 steps */
  readonly lowStepDays: number;
  readonly foodPhotos: number;
  readonly appUsageMinutesPerDay: number;
  readonly channelMessagesPerDay: number;
}

export interface DialogueStyle {
  readonly verbosity: 'minimal' | 'normal' | 'verbose';
  readonly tone: 'philosophical' | 'foodie' | 'social' | 'quiet' | 'curious' | 'neutral';
  readonly greeting: string;
  readonly farewell: string;
  readonly responseToCompliment: string;
}

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

/** Hard ceiling for each trait value */
const TRAIT_MAX = 100;
const TRAIT_MIN = -100;

/** Maximum drift that may be applied to a single trait in one week */
const MAX_DRIFT_PER_WEEK = 3;

/** All trait keys in a stable order */
const ALL_TRAITS: readonly PersonalityTrait[] = [
  'introversion_extroversion',
  'laziness_curiosity',
  'emotional_rational',
  'talkative_silent',
  'foodie_ascetic',
  'nightowl_earlybird',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampTrait(value: number): number {
  return clamp(value, TRAIT_MIN, TRAIT_MAX);
}

function clampDrift(delta: number): number {
  return clamp(delta, -MAX_DRIFT_PER_WEEK, MAX_DRIFT_PER_WEEK);
}

// ---------------------------------------------------------------------------
// PersonalityEngine
// ---------------------------------------------------------------------------

export class PersonalityEngine {
  /**
   * Create a neutral personality (all traits at 0).
   */
  static createDefault(): PersonalityDNA {
    return {
      introversion_extroversion: 0,
      laziness_curiosity: 0,
      emotional_rational: 0,
      talkative_silent: 0,
      foodie_ascetic: 0,
      nightowl_earlybird: 0,
    };
  }

  /**
   * Apply a sequence of weekly drifts to a personality.
   *
   * Each drift is clamped to ±3 before application; the resulting trait value
   * is clamped to [-100, 100].  Returns a new `PersonalityDNA` — the original
   * is never mutated.
   */
  static applyDrift(
    personality: PersonalityDNA,
    drifts: readonly PersonalityDrift[],
  ): PersonalityDNA {
    // Accumulate deltas by trait
    const accumulated: Record<PersonalityTrait, number> = {
      introversion_extroversion: 0,
      laziness_curiosity: 0,
      emotional_rational: 0,
      talkative_silent: 0,
      foodie_ascetic: 0,
      nightowl_earlybird: 0,
    };

    for (const drift of drifts) {
      accumulated[drift.trait] += clampDrift(drift.delta);
    }

    return {
      introversion_extroversion: clampTrait(
        personality.introversion_extroversion + clampDrift(accumulated.introversion_extroversion),
      ),
      laziness_curiosity: clampTrait(
        personality.laziness_curiosity + clampDrift(accumulated.laziness_curiosity),
      ),
      emotional_rational: clampTrait(
        personality.emotional_rational + clampDrift(accumulated.emotional_rational),
      ),
      talkative_silent: clampTrait(
        personality.talkative_silent + clampDrift(accumulated.talkative_silent),
      ),
      foodie_ascetic: clampTrait(
        personality.foodie_ascetic + clampDrift(accumulated.foodie_ascetic),
      ),
      nightowl_earlybird: clampTrait(
        personality.nightowl_earlybird + clampDrift(accumulated.nightowl_earlybird),
      ),
    };
  }

  /**
   * Derive personality drifts from one week's behaviour statistics.
   *
   * Rules:
   * - lateNightActiveDays ≥ 4  → nightowl_earlybird +2
   * - lateNightActiveDays ≤ 1  → nightowl_earlybird -1
   * - socialEncounters ≥ 5     → introversion_extroversion +2
   * - socialEncounters ≤ 1     → introversion_extroversion -1
   * - channelMessagesPerDay ≥ 10 → talkative_silent +2
   * - channelMessagesPerDay ≤ 2  → talkative_silent -1
   * - lowStepDays ≥ 5          → laziness_curiosity -2
   * - newLocationsVisited ≥ 4  → laziness_curiosity +2
   * - foodPhotos ≥ 5           → foodie_ascetic +2
   * - appUsageMinutesPerDay ≥ 120 → laziness_curiosity -1 (screen laziness)
   */
  static calculateDrifts(weeklyStats: WeeklyBehaviorStats): readonly PersonalityDrift[] {
    const drifts: PersonalityDrift[] = [];

    const push = (trait: PersonalityTrait, delta: number, reason: string): void => {
      drifts.push({ trait, delta, reason });
    };

    // Night-owl axis
    if (weeklyStats.lateNightActiveDays >= 4) {
      push('nightowl_earlybird', 2, 'frequent late-night activity');
    } else if (weeklyStats.lateNightActiveDays <= 1) {
      push('nightowl_earlybird', -1, 'rarely active at night');
    }

    // Social / extroversion axis
    if (weeklyStats.socialEncounters >= 5) {
      push('introversion_extroversion', 2, 'many social encounters');
    } else if (weeklyStats.socialEncounters <= 1) {
      push('introversion_extroversion', -1, 'very few social encounters');
    }

    // Talkative axis (channel messages)
    if (weeklyStats.channelMessagesPerDay >= 10) {
      push('talkative_silent', 2, 'high chat activity');
    } else if (weeklyStats.channelMessagesPerDay <= 2) {
      push('talkative_silent', -1, 'low chat activity');
    }

    // Curiosity / laziness axis
    if (weeklyStats.lowStepDays >= 5) {
      push('laziness_curiosity', -2, 'mostly sedentary week');
    }
    if (weeklyStats.newLocationsVisited >= 4) {
      push('laziness_curiosity', 2, 'explored many new places');
    }
    if (weeklyStats.appUsageMinutesPerDay >= 120) {
      push('laziness_curiosity', -1, 'heavy screen time suggests sedentary behaviour');
    }

    // Foodie axis
    if (weeklyStats.foodPhotos >= 5) {
      push('foodie_ascetic', 2, 'lots of food photos taken');
    }

    return drifts;
  }

  /**
   * Calculate a compatibility score (0–100) between two lobsters.
   *
   * Scoring model:
   * - Complementary pairs (social + introversion_extroversion) get a bonus when
   *   the two values are on opposite sides (signs differ).
   * - Shared enthusiasm for the same trait (both extreme foodie, both night-owl,
   *   etc.) also adds a bonus when both values have the same sign and are > 30.
   * - Base score is derived from normalised similarity across all traits.
   */
  static calculateMatch(a: PersonalityDNA, b: PersonalityDNA): number {
    let score = 0;

    // 1. Complementary bonus: introvert + extrovert is good (opposite signs)
    const complementaryPairs: [PersonalityTrait, PersonalityTrait][] = [
      ['introversion_extroversion', 'introversion_extroversion'],
      ['talkative_silent', 'talkative_silent'],
    ];
    for (const [traitA, traitB] of complementaryPairs) {
      const va = a[traitA];
      const vb = b[traitB];
      // Opposite signs and both non-trivial
      if (Math.sign(va) !== Math.sign(vb) && Math.abs(va) > 20 && Math.abs(vb) > 20) {
        score += 10;
      }
    }

    // 2. Shared passion bonus: both foodie, both night-owl, both curious
    const sharedPassionTraits: PersonalityTrait[] = [
      'foodie_ascetic',
      'nightowl_earlybird',
      'laziness_curiosity',
    ];
    for (const trait of sharedPassionTraits) {
      const va = a[trait];
      const vb = b[trait];
      if (Math.sign(va) === Math.sign(vb) && Math.abs(va) > 30 && Math.abs(vb) > 30) {
        score += 8;
      }
    }

    // 3. Base similarity score across all traits
    let totalDiff = 0;
    for (const trait of ALL_TRAITS) {
      totalDiff += Math.abs(a[trait] - b[trait]);
    }
    // Maximum possible totalDiff = 6 * 200 = 1200; map to 0–60
    const similarityScore = Math.round((1 - totalDiff / 1200) * 60);
    score += similarityScore;

    return clamp(score, 0, 100);
  }

  /**
   * Derive a flavourful Chinese archetype name from the dominant traits.
   *
   * Returns a composed label such as "沉默的夜猫哲学家".
   */
  static getArchetype(personality: PersonalityDNA): string {
    const parts: string[] = [];

    // Social prefix
    if (personality.introversion_extroversion >= 40) {
      parts.push('外向的');
    } else if (personality.introversion_extroversion <= -40) {
      parts.push('内向的');
    }

    // Night-owl modifier
    if (personality.nightowl_earlybird >= 40) {
      parts.push('夜猫');
    } else if (personality.nightowl_earlybird <= -40) {
      parts.push('早起');
    }

    // Foodie modifier
    if (personality.foodie_ascetic >= 40) {
      parts.push('贪吃');
    } else if (personality.foodie_ascetic <= -40) {
      parts.push('禁食');
    }

    // Talkative modifier
    if (personality.talkative_silent >= 40) {
      parts.push('话痨');
    } else if (personality.talkative_silent <= -40) {
      parts.push('沉默的');
    }

    // Core identity based on the single highest absolute trait
    const dominantTrait = ALL_TRAITS.reduce(
      (best, trait) =>
        Math.abs(personality[trait]) > Math.abs(personality[best]) ? trait : best,
      ALL_TRAITS[0],
    );

    const coreNames: Record<PersonalityTrait, [string, string]> = {
      introversion_extroversion: ['社交达虾', '独行虾侠'],
      laziness_curiosity: ['探险龙虾', '躺平龙虾'],
      emotional_rational: ['感性诗人虾', '理性分析虾'],
      talkative_silent: ['社交达虾', '禅定龙虾'],
      foodie_ascetic: ['美食龙虾', '禅食龙虾'],
      nightowl_earlybird: ['夜猫哲学家', '晨曦追光虾'],
    };

    const [positiveName, negativeName] = coreNames[dominantTrait];
    const coreName =
      personality[dominantTrait] >= 0 ? positiveName : negativeName;

    // Deduplicate and assemble
    const unique = [...new Set(parts)];
    return unique.join('') + coreName;
  }

  /**
   * Produce dialogue-style hints that can be injected into an AI prompt.
   */
  static getDialogueStyle(personality: PersonalityDNA): DialogueStyle {
    // Verbosity is driven by talkative_silent
    const verbosity: DialogueStyle['verbosity'] =
      personality.talkative_silent >= 30
        ? 'verbose'
        : personality.talkative_silent <= -30
          ? 'minimal'
          : 'normal';

    // Tone is driven by the strongest non-social trait
    let tone: DialogueStyle['tone'] = 'neutral';
    if (personality.foodie_ascetic >= 40) {
      tone = 'foodie';
    } else if (personality.emotional_rational <= -40) {
      tone = 'philosophical';
    } else if (personality.introversion_extroversion >= 40) {
      tone = 'social';
    } else if (personality.introversion_extroversion <= -40) {
      tone = 'quiet';
    } else if (personality.laziness_curiosity >= 40) {
      tone = 'curious';
    }

    // Greeting / farewell / compliment responses keyed on tone
    const styleMap: Record<
      DialogueStyle['tone'],
      { greeting: string; farewell: string; responseToCompliment: string }
    > = {
      philosophical: {
        greeting: '...存在即感知，你来了。',
        farewell: '离去不过是另一种抵达。',
        responseToCompliment: '夸奖是一种幻觉，但感谢你制造了它。',
      },
      foodie: {
        greeting: '呀！你来啦～今天吃了什么好吃的？',
        farewell: '记得好好吃饭，再见！',
        responseToCompliment: '谢谢夸奖，要不要一起吃点好的庆祝一下？',
      },
      social: {
        greeting: '嘿嘿，你终于来了！等你好久了！',
        farewell: '拜拜～记得常来找我玩！',
        responseToCompliment: '哇谢谢！你也超棒的！',
      },
      quiet: {
        greeting: '...嗯。',
        farewell: '...拜。',
        responseToCompliment: '...还行吧。',
      },
      curious: {
        greeting: '哦？你来了，最近有什么新发现吗？',
        farewell: '去探索吧，记得回来告诉我！',
        responseToCompliment: '真的吗？好奇你是怎么看出来的。',
      },
      neutral: {
        greeting: '嗨，你好呀。',
        farewell: '再见，下次见。',
        responseToCompliment: '谢谢，这让我很开心。',
      },
    };

    const style = styleMap[tone];

    return {
      verbosity,
      tone,
      greeting: style.greeting,
      farewell: style.farewell,
      responseToCompliment: style.responseToCompliment,
    };
  }
}
