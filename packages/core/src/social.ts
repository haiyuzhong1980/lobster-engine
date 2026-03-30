// @lobster-engine/core — Social system: relations, group effects, shell economy

import type {
  SocialRelation,
  RelationLevel,
  EncounterRecord,
} from './lobster-types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEVEL_ORDER: readonly RelationLevel[] = [
  'stranger',
  'nodding',
  'familiar',
  'iron',
  'soul',
];

// ---------------------------------------------------------------------------
// Upgrade requirements
// ---------------------------------------------------------------------------

export interface UpgradeRequirements {
  readonly encounterCount: number;
  readonly uniqueDays?: number;
  readonly giftsExchanged?: number;
  readonly personalityMatch?: number;  // minimum match %
  readonly collaborationsCompleted?: number;
  readonly mutualConfirmation?: boolean;
}

const UPGRADE_REQUIREMENTS: Readonly<Record<RelationLevel, UpgradeRequirements>> = {
  // Requirements to move FROM this level to the next
  stranger: {
    encounterCount: 3,
    uniqueDays: 3,
  },
  nodding: {
    encounterCount: 5,
    giftsExchanged: 1,
    personalityMatch: 60,
  },
  familiar: {
    encounterCount: 10,
    collaborationsCompleted: 1,
    mutualConfirmation: true,
  },
  iron: {
    encounterCount: 20,
    collaborationsCompleted: 3,
    mutualConfirmation: true,
  },
  // soul is the terminal level — no upgrade from here
  soul: {
    encounterCount: 0,
  },
};

// ---------------------------------------------------------------------------
// Unlocked interactions per level
// ---------------------------------------------------------------------------

const UNLOCKED_INTERACTIONS: Readonly<Record<RelationLevel, readonly string[]>> = {
  stranger: ['wave'],
  nodding: ['wave', 'emoji_reaction', 'gift_small'],
  familiar: ['wave', 'emoji_reaction', 'gift_small', 'gift_large', 'collaborate'],
  iron: ['wave', 'emoji_reaction', 'gift_small', 'gift_large', 'collaborate', 'co_diary', 'secret_share'],
  soul: ['wave', 'emoji_reaction', 'gift_small', 'gift_large', 'collaborate', 'co_diary', 'secret_share', 'soul_link', 'joint_arena'],
};

// ---------------------------------------------------------------------------
// Helper: calendar day string from Unix ms
// ---------------------------------------------------------------------------

function toDateString(timestampMs: number): string {
  return new Date(timestampMs).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// RelationManager
// ---------------------------------------------------------------------------

export class RelationManager {
  /**
   * Create a new stranger-level relation between two lobsters.
   */
  static createRelation(lobsterA: string, lobsterB: string): SocialRelation {
    const now = Date.now();
    return {
      lobsterA,
      lobsterB,
      level: 'stranger',
      encounterCount: 0,
      firstMet: now,
      lastMet: now,
      giftsExchanged: 0,
      collaborationsCompleted: 0,
      personalityMatch: 0,
      uniqueDays: [],
      confirmedByA: false,
      confirmedByB: false,
    };
  }

  /**
   * Process an encounter and return an updated relation.
   * Increments counters and potentially triggers an upgrade.
   */
  static processEncounter(
    relation: SocialRelation,
    encounter: EncounterRecord,
  ): SocialRelation {
    const day = toDateString(encounter.timestamp);
    const uniqueDays = relation.uniqueDays.includes(day)
      ? relation.uniqueDays
      : [...relation.uniqueDays, day];

    const updated: SocialRelation = {
      ...relation,
      encounterCount: relation.encounterCount + 1,
      lastMet: encounter.timestamp,
      giftsExchanged: relation.giftsExchanged + (encounter.giftExchanged ? 1 : 0),
      collaborationsCompleted:
        relation.collaborationsCompleted + (encounter.collaborationCompleted ? 1 : 0),
      uniqueDays,
    };

    const newLevel = RelationManager.checkUpgrade(updated);
    if (newLevel === null) {
      return updated;
    }

    return {
      ...updated,
      level: newLevel,
      // Reset mutual confirmation flags after upgrade
      confirmedByA: false,
      confirmedByB: false,
    };
  }

  /**
   * Check whether the relation qualifies for a level upgrade.
   * Returns the new level, or null if not yet eligible.
   */
  static checkUpgrade(relation: SocialRelation): RelationLevel | null {
    const currentIndex = LEVEL_ORDER.indexOf(relation.level);
    if (currentIndex === -1 || currentIndex >= LEVEL_ORDER.length - 1) {
      return null;
    }

    const reqs = UPGRADE_REQUIREMENTS[relation.level];
    const next = LEVEL_ORDER[currentIndex + 1];

    if (relation.encounterCount < reqs.encounterCount) return null;
    if (reqs.uniqueDays !== undefined && relation.uniqueDays.length < reqs.uniqueDays) return null;
    if (reqs.giftsExchanged !== undefined && relation.giftsExchanged < reqs.giftsExchanged) return null;
    if (reqs.personalityMatch !== undefined && relation.personalityMatch < reqs.personalityMatch) return null;
    if (reqs.collaborationsCompleted !== undefined && relation.collaborationsCompleted < reqs.collaborationsCompleted) return null;
    if (reqs.mutualConfirmation === true && !(relation.confirmedByA && relation.confirmedByB)) return null;

    return next;
  }

  /**
   * Return the upgrade requirements for a given level
   * (i.e., what is needed to leave that level).
   */
  static getUpgradeRequirements(level: RelationLevel): UpgradeRequirements {
    return UPGRADE_REQUIREMENTS[level];
  }

  /**
   * Return the list of interactions unlocked at a given level.
   */
  static getUnlockedInteractions(level: RelationLevel): readonly string[] {
    return UNLOCKED_INTERACTIONS[level];
  }
}

// ---------------------------------------------------------------------------
// Group effect types
// ---------------------------------------------------------------------------

export type GroupEffectType =
  | 'pair'           // 2 lobsters
  | 'squad'          // 3–5 lobsters
  | 'party'          // 5–10 lobsters
  | 'giant_lobster'  // 10+ lobsters
  | 'landmark';      // 50+ lobsters

export interface GeoReport {
  readonly lobsterId: string;
  readonly geoHash: string;     // precision 6 (~1.2 km)
  readonly timestamp: number;
}

export interface GroupEffect {
  readonly geoHash: string;
  readonly lobsterIds: readonly string[];
  readonly size: number;
  readonly effectType: GroupEffectType;
  readonly reward: { shells: number; description: string };
}

// ---------------------------------------------------------------------------
// GroupEffectDetector
// ---------------------------------------------------------------------------

function classifyGroupSize(size: number): GroupEffectType {
  if (size >= 50) return 'landmark';
  if (size >= 10) return 'giant_lobster';
  if (size >= 5) return 'party';
  if (size >= 3) return 'squad';
  return 'pair';
}

function groupRewardForType(effectType: GroupEffectType, size: number): { shells: number; description: string } {
  switch (effectType) {
    case 'pair':
      return { shells: 5, description: 'Two lobsters met!' };
    case 'squad':
      return { shells: 10, description: `Squad of ${size} gathered!` };
    case 'party':
      return { shells: 10, description: `Party of ${size} — shells for everyone!` };
    case 'giant_lobster':
      return { shells: 15, description: `Giant lobster event — ${size} lobsters assembled!` };
    case 'landmark':
      return { shells: 50, description: `Landmark gathering — ${size} lobsters at one spot!` };
  }
}

export class GroupEffectDetector {
  /**
   * Given a list of geo reports, detect clusters sharing the same geoHash
   * and return the corresponding group effects.
   */
  static detectGroups(reports: readonly GeoReport[]): readonly GroupEffect[] {
    // Aggregate lobsterIds per geoHash, deduplicating by lobsterId
    const buckets = new Map<string, Set<string>>();
    for (const report of reports) {
      const existing = buckets.get(report.geoHash);
      if (existing !== undefined) {
        existing.add(report.lobsterId);
      } else {
        buckets.set(report.geoHash, new Set([report.lobsterId]));
      }
    }

    const effects: GroupEffect[] = [];
    for (const [geoHash, ids] of buckets) {
      const size = ids.size;
      if (size < 2) continue; // no group effect for solo lobsters

      const lobsterIds = Array.from(ids);
      const effectType = classifyGroupSize(size);
      const reward = groupRewardForType(effectType, size);

      effects.push({ geoHash, lobsterIds, size, effectType, reward });
    }

    return effects;
  }
}

// ---------------------------------------------------------------------------
// Shell economy
// ---------------------------------------------------------------------------

export interface ShellReward {
  readonly amount: number;
  readonly reason: string;
}

export class ShellEconomy {
  /**
   * Calculate the shell reward for a single encounter.
   * Only one reward per lobster-pair per day (isFirstToday).
   */
  static encounterReward(relation: SocialRelation, isFirstToday: boolean): ShellReward {
    if (relation.encounterCount === 1) {
      // Very first encounter between these two
      return { amount: 5, reason: 'First encounter with new lobster' };
    }
    if (isFirstToday) {
      return { amount: 2, reason: 'Repeat encounter (first today)' };
    }
    return { amount: 0, reason: 'Already rewarded today' };
  }

  /**
   * Calculate the shell reward for a detected group effect.
   */
  static groupReward(effect: GroupEffect): ShellReward {
    return { amount: effect.reward.shells, reason: effect.reward.description };
  }

  /**
   * Calculate the shell reward granted when a relation is upgraded.
   */
  static upgradeReward(newLevel: RelationLevel): ShellReward {
    return { amount: 20, reason: `Relation upgraded to ${newLevel}` };
  }

  /**
   * Validate that the sender has enough shells to cover a gift cost.
   */
  static validateGift(senderShells: number, giftCost: number): boolean {
    return senderShells >= giftCost;
  }
}
