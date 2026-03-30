// @lobster-engine/core — Social system tests (B.5 + B.6)

import { describe, it, expect } from 'vitest';
import {
  RelationManager,
  GroupEffectDetector,
  ShellEconomy,
} from '../social.js';
import type {
  SocialRelation,
  EncounterRecord,
} from '../lobster-types.js';
import type { GeoReport } from '../social.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEncounter(
  overrides: Partial<EncounterRecord> = {},
): EncounterRecord {
  return {
    id: 'enc-1',
    lobsterA: 'a',
    lobsterB: 'b',
    location: 's8t3b3',
    method: 'gps',
    timestamp: Date.now(),
    giftExchanged: false,
    collaborationCompleted: false,
    ...overrides,
  };
}

function makeRelation(overrides: Partial<SocialRelation> = {}): SocialRelation {
  return {
    lobsterA: 'a',
    lobsterB: 'b',
    level: 'stranger',
    encounterCount: 0,
    firstMet: Date.now(),
    lastMet: Date.now(),
    giftsExchanged: 0,
    collaborationsCompleted: 0,
    personalityMatch: 0,
    uniqueDays: [],
    confirmedByA: false,
    confirmedByB: false,
    ...overrides,
  };
}

/** Returns a timestamp offset by `days` days from the epoch base. */
function dayTs(base: number, days: number): number {
  return base + days * 86_400_000;
}

// ---------------------------------------------------------------------------
// RelationManager — creation
// ---------------------------------------------------------------------------

describe('RelationManager.createRelation', () => {
  it('creates a relation at stranger level', () => {
    const rel = RelationManager.createRelation('alice', 'bob');
    expect(rel.level).toBe('stranger');
    expect(rel.lobsterA).toBe('alice');
    expect(rel.lobsterB).toBe('bob');
  });

  it('initialises all counters to zero', () => {
    const rel = RelationManager.createRelation('a', 'b');
    expect(rel.encounterCount).toBe(0);
    expect(rel.giftsExchanged).toBe(0);
    expect(rel.collaborationsCompleted).toBe(0);
    expect(rel.uniqueDays).toEqual([]);
  });

  it('sets confirmedByA and confirmedByB to false', () => {
    const rel = RelationManager.createRelation('a', 'b');
    expect(rel.confirmedByA).toBe(false);
    expect(rel.confirmedByB).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// RelationManager — encounter processing
// ---------------------------------------------------------------------------

describe('RelationManager.processEncounter', () => {
  it('increments encounterCount by 1', () => {
    const rel = makeRelation();
    const enc = makeEncounter();
    const updated = RelationManager.processEncounter(rel, enc);
    expect(updated.encounterCount).toBe(1);
  });

  it('updates lastMet to the encounter timestamp', () => {
    const ts = Date.now() + 5_000;
    const rel = makeRelation();
    const enc = makeEncounter({ timestamp: ts });
    const updated = RelationManager.processEncounter(rel, enc);
    expect(updated.lastMet).toBe(ts);
  });

  it('increments giftsExchanged when giftExchanged is true', () => {
    const rel = makeRelation();
    const enc = makeEncounter({ giftExchanged: true });
    const updated = RelationManager.processEncounter(rel, enc);
    expect(updated.giftsExchanged).toBe(1);
  });

  it('does not increment giftsExchanged when giftExchanged is false', () => {
    const rel = makeRelation();
    const enc = makeEncounter({ giftExchanged: false });
    const updated = RelationManager.processEncounter(rel, enc);
    expect(updated.giftsExchanged).toBe(0);
  });

  it('increments collaborationsCompleted when collaboration is true', () => {
    const rel = makeRelation();
    const enc = makeEncounter({ collaborationCompleted: true });
    const updated = RelationManager.processEncounter(rel, enc);
    expect(updated.collaborationsCompleted).toBe(1);
  });

  it('adds a unique day on first encounter of a day', () => {
    const ts = new Date('2025-01-01T10:00:00Z').getTime();
    const rel = makeRelation();
    const enc = makeEncounter({ timestamp: ts });
    const updated = RelationManager.processEncounter(rel, enc);
    expect(updated.uniqueDays).toContain('2025-01-01');
    expect(updated.uniqueDays).toHaveLength(1);
  });

  it('does not duplicate a day when multiple encounters happen on the same day', () => {
    const ts1 = new Date('2025-01-02T08:00:00Z').getTime();
    const ts2 = new Date('2025-01-02T18:00:00Z').getTime();
    const rel = makeRelation();
    const after1 = RelationManager.processEncounter(rel, makeEncounter({ id: 'e1', timestamp: ts1 }));
    const after2 = RelationManager.processEncounter(after1, makeEncounter({ id: 'e2', timestamp: ts2 }));
    expect(after2.uniqueDays.filter(d => d === '2025-01-02')).toHaveLength(1);
  });

  it('accumulates multiple distinct days', () => {
    const base = new Date('2025-02-01T12:00:00Z').getTime();
    let rel = makeRelation();
    for (let i = 0; i < 4; i++) {
      rel = RelationManager.processEncounter(rel, makeEncounter({ id: `e${i}`, timestamp: dayTs(base, i) }));
    }
    expect(rel.uniqueDays).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// RelationManager — level upgrade detection
// ---------------------------------------------------------------------------

describe('RelationManager.checkUpgrade', () => {
  // ------ stranger → nodding ------
  describe('stranger → nodding', () => {
    it('does not upgrade before 3 encounters on different days', () => {
      const base = new Date('2025-03-01T12:00:00Z').getTime();
      let rel = RelationManager.createRelation('a', 'b');
      for (let i = 0; i < 2; i++) {
        rel = RelationManager.processEncounter(rel, makeEncounter({ id: `e${i}`, timestamp: dayTs(base, i) }));
      }
      expect(rel.level).toBe('stranger');
    });

    it('upgrades to nodding after 3 encounters on 3 different days', () => {
      const base = new Date('2025-03-01T12:00:00Z').getTime();
      let rel = RelationManager.createRelation('a', 'b');
      for (let i = 0; i < 3; i++) {
        rel = RelationManager.processEncounter(rel, makeEncounter({ id: `e${i}`, timestamp: dayTs(base, i) }));
      }
      expect(rel.level).toBe('nodding');
    });

    it('does not upgrade if 3 encounters happen on the same day', () => {
      const ts = new Date('2025-03-01T12:00:00Z').getTime();
      let rel = RelationManager.createRelation('a', 'b');
      for (let i = 0; i < 3; i++) {
        rel = RelationManager.processEncounter(rel, makeEncounter({ id: `e${i}`, timestamp: ts + i * 1000 }));
      }
      expect(rel.level).toBe('stranger');
    });
  });

  // ------ nodding → familiar ------
  describe('nodding → familiar', () => {
    it('upgrades to familiar after 5 encounters + 1 gift + personalityMatch ≥ 60', () => {
      const base = new Date('2025-04-01T12:00:00Z').getTime();
      let rel = makeRelation({ level: 'nodding', personalityMatch: 75 });
      for (let i = 0; i < 5; i++) {
        rel = RelationManager.processEncounter(
          rel,
          makeEncounter({ id: `e${i}`, timestamp: dayTs(base, i), giftExchanged: i === 0 }),
        );
      }
      expect(rel.level).toBe('familiar');
    });

    it('does not upgrade when personalityMatch is below 60', () => {
      const base = new Date('2025-04-01T12:00:00Z').getTime();
      let rel = makeRelation({ level: 'nodding', personalityMatch: 50 });
      for (let i = 0; i < 5; i++) {
        rel = RelationManager.processEncounter(
          rel,
          makeEncounter({ id: `e${i}`, timestamp: dayTs(base, i), giftExchanged: i === 0 }),
        );
      }
      expect(rel.level).toBe('nodding');
    });

    it('does not upgrade without a gift', () => {
      const base = new Date('2025-04-01T12:00:00Z').getTime();
      let rel = makeRelation({ level: 'nodding', personalityMatch: 80 });
      for (let i = 0; i < 5; i++) {
        rel = RelationManager.processEncounter(rel, makeEncounter({ id: `e${i}`, timestamp: dayTs(base, i) }));
      }
      expect(rel.level).toBe('nodding');
    });
  });

  // ------ familiar → iron ------
  describe('familiar → iron', () => {
    it('upgrades to iron after 10 encounters + 1 collaboration + mutual confirmation', () => {
      const base = new Date('2025-05-01T12:00:00Z').getTime();
      let rel = makeRelation({
        level: 'familiar',
        confirmedByA: true,
        confirmedByB: true,
      });
      for (let i = 0; i < 10; i++) {
        rel = RelationManager.processEncounter(
          rel,
          makeEncounter({ id: `e${i}`, timestamp: dayTs(base, i), collaborationCompleted: i === 0 }),
        );
      }
      expect(rel.level).toBe('iron');
    });

    it('does not upgrade without mutual confirmation', () => {
      const base = new Date('2025-05-01T12:00:00Z').getTime();
      let rel = makeRelation({ level: 'familiar', confirmedByA: true, confirmedByB: false });
      for (let i = 0; i < 10; i++) {
        rel = RelationManager.processEncounter(
          rel,
          makeEncounter({ id: `e${i}`, timestamp: dayTs(base, i), collaborationCompleted: i === 0 }),
        );
      }
      expect(rel.level).toBe('familiar');
    });
  });

  // ------ iron → soul ------
  describe('iron → soul', () => {
    it('upgrades to soul after 20 encounters + 3 collaborations + mutual confirmation', () => {
      const base = new Date('2025-06-01T12:00:00Z').getTime();
      let rel = makeRelation({
        level: 'iron',
        confirmedByA: true,
        confirmedByB: true,
      });
      for (let i = 0; i < 20; i++) {
        rel = RelationManager.processEncounter(
          rel,
          makeEncounter({
            id: `e${i}`,
            timestamp: dayTs(base, i),
            collaborationCompleted: i < 3,
          }),
        );
      }
      expect(rel.level).toBe('soul');
    });

    it('does not upgrade with fewer than 3 collaborations', () => {
      const base = new Date('2025-06-01T12:00:00Z').getTime();
      let rel = makeRelation({
        level: 'iron',
        confirmedByA: true,
        confirmedByB: true,
      });
      for (let i = 0; i < 20; i++) {
        rel = RelationManager.processEncounter(
          rel,
          makeEncounter({
            id: `e${i}`,
            timestamp: dayTs(base, i),
            collaborationCompleted: i === 0, // only 1 collab
          }),
        );
      }
      expect(rel.level).toBe('iron');
    });
  });

  // ------ soul is terminal ------
  it('returns null for soul level (no further upgrade)', () => {
    const rel = makeRelation({ level: 'soul', encounterCount: 100 });
    expect(RelationManager.checkUpgrade(rel)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// RelationManager — upgrade requirements
// ---------------------------------------------------------------------------

describe('RelationManager.getUpgradeRequirements', () => {
  it('stranger requires 3 encounters on 3 unique days', () => {
    const reqs = RelationManager.getUpgradeRequirements('stranger');
    expect(reqs.encounterCount).toBe(3);
    expect(reqs.uniqueDays).toBe(3);
  });

  it('nodding requires 5 encounters, 1 gift, 60% personality match', () => {
    const reqs = RelationManager.getUpgradeRequirements('nodding');
    expect(reqs.encounterCount).toBe(5);
    expect(reqs.giftsExchanged).toBe(1);
    expect(reqs.personalityMatch).toBe(60);
  });

  it('familiar requires 10 encounters, 1 collaboration, mutual confirmation', () => {
    const reqs = RelationManager.getUpgradeRequirements('familiar');
    expect(reqs.encounterCount).toBe(10);
    expect(reqs.collaborationsCompleted).toBe(1);
    expect(reqs.mutualConfirmation).toBe(true);
  });

  it('iron requires 20 encounters, 3 collaborations, mutual confirmation', () => {
    const reqs = RelationManager.getUpgradeRequirements('iron');
    expect(reqs.encounterCount).toBe(20);
    expect(reqs.collaborationsCompleted).toBe(3);
    expect(reqs.mutualConfirmation).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// RelationManager — unlocked interactions
// ---------------------------------------------------------------------------

describe('RelationManager.getUnlockedInteractions', () => {
  it('stranger can only wave', () => {
    const actions = RelationManager.getUnlockedInteractions('stranger');
    expect(actions).toContain('wave');
    expect(actions).toHaveLength(1);
  });

  it('nodding unlocks emoji_reaction and small gifts', () => {
    const actions = RelationManager.getUnlockedInteractions('nodding');
    expect(actions).toContain('emoji_reaction');
    expect(actions).toContain('gift_small');
  });

  it('familiar unlocks collaborate and large gifts', () => {
    const actions = RelationManager.getUnlockedInteractions('familiar');
    expect(actions).toContain('gift_large');
    expect(actions).toContain('collaborate');
  });

  it('iron unlocks co_diary and secret_share', () => {
    const actions = RelationManager.getUnlockedInteractions('iron');
    expect(actions).toContain('co_diary');
    expect(actions).toContain('secret_share');
  });

  it('soul unlocks soul_link and joint_arena', () => {
    const actions = RelationManager.getUnlockedInteractions('soul');
    expect(actions).toContain('soul_link');
    expect(actions).toContain('joint_arena');
  });

  it('each level is a strict superset of the previous level', () => {
    const levels = ['stranger', 'nodding', 'familiar', 'iron', 'soul'] as const;
    for (let i = 1; i < levels.length; i++) {
      const prev = RelationManager.getUnlockedInteractions(levels[i - 1]);
      const curr = RelationManager.getUnlockedInteractions(levels[i]);
      for (const action of prev) {
        expect(curr).toContain(action);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// GroupEffectDetector
// ---------------------------------------------------------------------------

describe('GroupEffectDetector.detectGroups', () => {
  function makeReports(ids: string[], geoHash = 'abc123'): GeoReport[] {
    return ids.map(id => ({ lobsterId: id, geoHash, timestamp: Date.now() }));
  }

  it('returns no effects for a single lobster in a geoHash', () => {
    const effects = GroupEffectDetector.detectGroups(makeReports(['a']));
    expect(effects).toHaveLength(0);
  });

  it('detects a pair (2 lobsters) as effectType "pair"', () => {
    const effects = GroupEffectDetector.detectGroups(makeReports(['a', 'b']));
    expect(effects).toHaveLength(1);
    expect(effects[0].effectType).toBe('pair');
    expect(effects[0].size).toBe(2);
  });

  it('detects 3 lobsters as effectType "squad"', () => {
    const effects = GroupEffectDetector.detectGroups(makeReports(['a', 'b', 'c']));
    expect(effects[0].effectType).toBe('squad');
  });

  it('detects 5 lobsters as effectType "party"', () => {
    const ids = Array.from({ length: 5 }, (_, i) => `l${i}`);
    const effects = GroupEffectDetector.detectGroups(makeReports(ids));
    expect(effects[0].effectType).toBe('party');
    expect(effects[0].size).toBe(5);
  });

  it('detects 7 lobsters as effectType "party"', () => {
    const ids = Array.from({ length: 7 }, (_, i) => `l${i}`);
    const effects = GroupEffectDetector.detectGroups(makeReports(ids));
    expect(effects[0].effectType).toBe('party');
  });

  it('detects 10 lobsters as effectType "giant_lobster"', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `l${i}`);
    const effects = GroupEffectDetector.detectGroups(makeReports(ids));
    expect(effects[0].effectType).toBe('giant_lobster');
    expect(effects[0].size).toBe(10);
  });

  it('detects 50 lobsters as effectType "landmark"', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `l${i}`);
    const effects = GroupEffectDetector.detectGroups(makeReports(ids));
    expect(effects[0].effectType).toBe('landmark');
    expect(effects[0].size).toBe(50);
  });

  it('separates lobsters in different geoHashes into distinct groups', () => {
    const reports: GeoReport[] = [
      { lobsterId: 'a', geoHash: 'hash1', timestamp: Date.now() },
      { lobsterId: 'b', geoHash: 'hash1', timestamp: Date.now() },
      { lobsterId: 'c', geoHash: 'hash2', timestamp: Date.now() },
      { lobsterId: 'd', geoHash: 'hash2', timestamp: Date.now() },
    ];
    const effects = GroupEffectDetector.detectGroups(reports);
    expect(effects).toHaveLength(2);
    const hashes = effects.map(e => e.geoHash).sort();
    expect(hashes).toEqual(['hash1', 'hash2']);
  });

  it('deduplicates the same lobster reporting twice in the same geoHash', () => {
    const reports: GeoReport[] = [
      { lobsterId: 'a', geoHash: 'hash1', timestamp: Date.now() },
      { lobsterId: 'a', geoHash: 'hash1', timestamp: Date.now() + 100 },
      { lobsterId: 'b', geoHash: 'hash1', timestamp: Date.now() },
    ];
    const effects = GroupEffectDetector.detectGroups(reports);
    expect(effects[0].size).toBe(2);
    expect(effects[0].lobsterIds).toHaveLength(2);
  });

  it('includes all lobsterIds in the effect', () => {
    const ids = ['alpha', 'beta', 'gamma'];
    const effects = GroupEffectDetector.detectGroups(makeReports(ids));
    for (const id of ids) {
      expect(effects[0].lobsterIds).toContain(id);
    }
  });
});

// ---------------------------------------------------------------------------
// ShellEconomy — encounter rewards
// ---------------------------------------------------------------------------

describe('ShellEconomy.encounterReward', () => {
  it('rewards 5 shells for the very first encounter (encounterCount === 1)', () => {
    const rel = makeRelation({ encounterCount: 1 });
    const reward = ShellEconomy.encounterReward(rel, true);
    expect(reward.amount).toBe(5);
  });

  it('rewards 2 shells for a repeat encounter on the first meeting today', () => {
    const rel = makeRelation({ encounterCount: 5 });
    const reward = ShellEconomy.encounterReward(rel, true);
    expect(reward.amount).toBe(2);
  });

  it('rewards 0 shells for a repeated meeting not first today', () => {
    const rel = makeRelation({ encounterCount: 5 });
    const reward = ShellEconomy.encounterReward(rel, false);
    expect(reward.amount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ShellEconomy — group rewards
// ---------------------------------------------------------------------------

describe('ShellEconomy.groupReward', () => {
  function makeGroup(effectType: import('../social.js').GroupEffectType, size: number): import('../social.js').GroupEffect {
    const rewardMap: Record<string, { shells: number; description: string }> = {
      pair: { shells: 5, description: 'pair' },
      squad: { shells: 10, description: 'squad' },
      party: { shells: 10, description: 'party' },
      giant_lobster: { shells: 15, description: 'giant' },
      landmark: { shells: 50, description: 'landmark' },
    };
    return {
      geoHash: 'xyz',
      lobsterIds: Array.from({ length: size }, (_, i) => `l${i}`),
      size,
      effectType,
      reward: rewardMap[effectType],
    };
  }

  it('party group rewards 10 shells', () => {
    const reward = ShellEconomy.groupReward(makeGroup('party', 6));
    expect(reward.amount).toBe(10);
  });

  it('giant_lobster group rewards 15 shells', () => {
    const reward = ShellEconomy.groupReward(makeGroup('giant_lobster', 12));
    expect(reward.amount).toBe(15);
  });

  it('landmark group rewards 50 shells', () => {
    const reward = ShellEconomy.groupReward(makeGroup('landmark', 50));
    expect(reward.amount).toBe(50);
  });

  it('pair group rewards 5 shells', () => {
    const reward = ShellEconomy.groupReward(makeGroup('pair', 2));
    expect(reward.amount).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// ShellEconomy — upgrade rewards
// ---------------------------------------------------------------------------

describe('ShellEconomy.upgradeReward', () => {
  it('rewards 20 shells for any level upgrade', () => {
    const levels = ['nodding', 'familiar', 'iron', 'soul'] as const;
    for (const level of levels) {
      const reward = ShellEconomy.upgradeReward(level);
      expect(reward.amount).toBe(20);
    }
  });

  it('includes the new level name in the reason', () => {
    const reward = ShellEconomy.upgradeReward('familiar');
    expect(reward.reason).toContain('familiar');
  });
});

// ---------------------------------------------------------------------------
// ShellEconomy — gift validation
// ---------------------------------------------------------------------------

describe('ShellEconomy.validateGift', () => {
  it('returns true when sender has exactly enough shells', () => {
    expect(ShellEconomy.validateGift(100, 100)).toBe(true);
  });

  it('returns true when sender has more than enough shells', () => {
    expect(ShellEconomy.validateGift(200, 50)).toBe(true);
  });

  it('returns false when sender has fewer shells than the cost', () => {
    expect(ShellEconomy.validateGift(30, 50)).toBe(false);
  });

  it('returns false when sender has 0 shells and cost is positive', () => {
    expect(ShellEconomy.validateGift(0, 1)).toBe(false);
  });

  it('returns true when cost is 0 regardless of balance', () => {
    expect(ShellEconomy.validateGift(0, 0)).toBe(true);
  });
});
