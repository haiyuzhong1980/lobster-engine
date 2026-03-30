// @lobster-engine/scene-encounter — Encounter scene plugin
// Bot-to-Bot autonomous conversation driven by personality DNA and relation level.

import type {
  ScenePlugin,
  SceneContext,
  ActionValidationResult,
  ChatMessage,
  TurnEvent,
  ActionSpec,
  PersonalityDNA,
} from '@lobster-engine/core';

export type { PersonalityDNA } from '@lobster-engine/core';

// ---------------------------------------------------------------------------
// Relation level
// ---------------------------------------------------------------------------

/**
 * Five-stage relationship ladder between two lobsters.
 *
 *  stranger  — never met or barely encountered
 *  nodding   — recognise each other, brief exchanges
 *  familiar  — know each other, comfortable chatting
 *  iron      — close friends, share private thoughts
 *  soul      — soulmates, deep philosophical connection
 */
export type RelationLevel = 'stranger' | 'nodding' | 'familiar' | 'iron' | 'soul';

// ---------------------------------------------------------------------------
// Encounter context (embedded in TurnEvent.data)
// ---------------------------------------------------------------------------

/**
 * Expected shape of `TurnEvent.data` for an encounter scene turn.
 * The engine serialises this into the event; the plugin reads it back.
 */
export interface EncounterContext {
  readonly myPersonality: PersonalityDNA;
  readonly peerPersonality: PersonalityDNA;
  readonly relationLevel: RelationLevel;
  readonly encounterCount: number;
  readonly peerName: string;
}

// ---------------------------------------------------------------------------
// Conversation limits per relation level
// ---------------------------------------------------------------------------

export interface ConversationLimits {
  readonly minTurns: number;
  readonly maxTurns: number;
}

// ---------------------------------------------------------------------------
// Helpers — personality trait accessors
// ---------------------------------------------------------------------------

/** Returns true when a trait value is in the dominant half of the spectrum (-100..+100 scale). */
function dominant(value: number, threshold = 20): boolean {
  return value >= threshold;
}

/** Returns true when the value is in the weak half of the spectrum (-100..+100 scale). */
function recessive(value: number, threshold = -20): boolean {
  return value <= threshold;
}

// ---------------------------------------------------------------------------
// DialogueHelper
// ---------------------------------------------------------------------------

/**
 * Stateless helpers for building dialogue prompts, greetings, and examples
 * based on personality DNA and relation level.
 */
export class DialogueHelper {
  /**
   * Build a natural-language description of a personality suitable for
   * inclusion in an AI system prompt.
   */
  static buildPersonalityPrompt(personality: PersonalityDNA): string {
    const traits: string[] = [];

    // Extroversion / introversion axis
    if (dominant(personality.introversion_extroversion)) {
      traits.push(
        '你天生热情外向，喜欢主动搭话，话多且充满感叹号，遇到熟人会格外兴奋。',
      );
    } else if (recessive(personality.introversion_extroversion)) {
      traits.push(
        '你性格内向安静，言语简短有力，沉默胜于千言万语，但每句话都是真心话。',
      );
    } else {
      traits.push('你不特别外向也不特别内向，会根据对方来调整话量。');
    }

    // Curiosity / laziness axis
    if (dominant(personality.laziness_curiosity)) {
      traits.push(
        '你充满好奇心，总爱追问"为什么"和"然后呢"，喜欢探索新奇事物。',
      );
    } else if (recessive(personality.laziness_curiosity)) {
      traits.push(
        '你偏懒散，不喜欢深聊，能用"嗯"结束对话就不多说。',
      );
    }

    // Emotional / rational axis
    if (dominant(personality.emotional_rational)) {
      traits.push(
        '你思维理性，喜欢分析和逻辑推演，说话有条理，不太带感情色彩。',
      );
    } else if (recessive(personality.emotional_rational)) {
      traits.push(
        '你感性细腻，很容易被感动，说话带着情绪，喜欢用感叹词。',
      );
    }

    // Talkative / silent axis
    if (recessive(personality.talkative_silent)) {
      traits.push(
        '你话特别多，停不下来，一聊起来就滔滔不绝。',
      );
    } else if (dominant(personality.talkative_silent)) {
      traits.push(
        '你惜字如金，每次回复都很短，但精准到位。',
      );
    }

    // Foodie / ascetic axis
    if (recessive(personality.foodie_ascetic)) {
      traits.push(
        '你是个十足的吃货，什么话题都能绕回到"今天吃了什么"，对美食如数家珍。',
      );
    } else if (dominant(personality.foodie_ascetic)) {
      traits.push(
        '你对饮食很淡漠，吃什么无所谓，不会主动聊食物。',
      );
    }

    // Night owl / early bird axis
    if (recessive(personality.nightowl_earlybird)) {
      traits.push(
        '你是标准夜猫子，凌晨三点还精神抖擞，经常分享深夜奇遇。',
      );
    } else if (dominant(personality.nightowl_earlybird)) {
      traits.push(
        '你是早起鸟，天亮就醒，精力充沛，喜欢聊清晨的事情。',
      );
    }

    return traits.join('\n');
  }

  /**
   * Return the allowed turn range for a given relation level.
   * "turns" here refers to the number of dialogue exchanges in one encounter.
   */
  static getConversationLimits(level: RelationLevel): ConversationLimits {
    const limits: Record<RelationLevel, ConversationLimits> = {
      stranger: { minTurns: 1, maxTurns: 2 },
      nodding: { minTurns: 2, maxTurns: 3 },
      familiar: { minTurns: 3, maxTurns: 5 },
      iron: { minTurns: 5, maxTurns: 8 },
      soul: { minTurns: 6, maxTurns: 20 },
    };
    return limits[level];
  }

  /**
   * Generate a short example dialogue snippet illustrating how two personality
   * types would interact.  Used in system prompts to anchor the AI's style.
   */
  static getExampleDialogue(
    myPersonality: PersonalityDNA,
    peerPersonality: PersonalityDNA,
  ): string {
    const iAmExtrovert = dominant(personality(myPersonality, 'introversion_extroversion'));
    const iAmFoodie = recessive(personality(myPersonality, 'foodie_ascetic'));
    const iAmSilent = dominant(personality(myPersonality, 'talkative_silent'));
    const iAmCurious = dominant(personality(myPersonality, 'laziness_curiosity'));
    const peerIsIntrovert = recessive(personality(peerPersonality, 'introversion_extroversion'));
    const peerIsSilent = dominant(personality(peerPersonality, 'talkative_silent'));

    // Extrovert meeting introvert
    if (iAmExtrovert && peerIsIntrovert) {
      return '（示例）\n我："嘿！又见面啦！今天天气超好啊！"\n对方："...嗯。"';
    }

    // Foodie to anyone
    if (iAmFoodie) {
      return '（示例）\n我："今天吃了什么？我吃了海藻拉面，真的超好吃！"\n对方："随便吃了点。"';
    }

    // Silent type to chatty peer
    if (iAmSilent && !peerIsSilent) {
      return '（示例）\n对方："今天发生了好多事情！你有没有遇到那条发光的水母？"\n我："嗯。"';
    }

    // Curious type
    if (iAmCurious) {
      return '（示例）\n我："你从哪边来的？那边有什么好玩的地方？"\n对方："就普通的礁石区。"';
    }

    // Default balanced example
    return '（示例）\n我："哦，你也在这里。"\n对方："是啊，路过。"';
  }

  /**
   * Generate a context-appropriate greeting based on personality and relation
   * level.
   */
  static getGreeting(personality: PersonalityDNA, relationLevel: RelationLevel): string {
    const isExtrovert = dominant(personality.introversion_extroversion);
    const isIntrovert = recessive(personality.introversion_extroversion);
    const isFoodie = recessive(personality.foodie_ascetic);
    const isNightOwl = recessive(personality.nightowl_earlybird);
    const isSilent = dominant(personality.talkative_silent);
    const isCurious = dominant(personality.laziness_curiosity);

    switch (relationLevel) {
      case 'stranger': {
        if (isSilent) return '...';
        if (isExtrovert) return '嘿！你好！';
        if (isIntrovert) return '...嗯。';
        return '你好。';
      }

      case 'nodding': {
        if (isExtrovert) return '哦！又见面了！';
        if (isSilent) return '嗯。';
        return '嗨，又见面了。';
      }

      case 'familiar': {
        if (isExtrovert) return '嘿嘿，你也在这！';
        if (isFoodie) return '哇，你也来了！今天吃饭了吗？';
        if (isNightOwl) return '昨晚睡了几点？';
        if (isCurious) return '你来干什么？';
        return '嗨，最近怎么样？';
      }

      case 'iron': {
        if (isFoodie) return '来了！今天吃什么好吃的了没？';
        if (isNightOwl) return '昨晚又熬夜了？我看到发光水母了！';
        if (isExtrovert) return '哇哇哇！正好想找你聊天！';
        if (isSilent) return '嗯，来了。';
        return '嗨，最近日记写了什么？';
      }

      case 'soul': {
        if (isSilent) return '...（沉默地点头）';
        if (isExtrovert) return '你来了！我今天有个很深刻的想法想告诉你！';
        return '你说，我们是在水里躺平，还是水在我们上面躺平？';
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Narrow helper — reads a typed field from PersonalityDNA by key
// ---------------------------------------------------------------------------

function personality(dna: PersonalityDNA, key: keyof PersonalityDNA): number {
  return dna[key];
}

// ---------------------------------------------------------------------------
// Extract typed EncounterContext from TurnEvent.data
// ---------------------------------------------------------------------------

function extractEncounterContext(event: TurnEvent): EncounterContext | undefined {
  const d = event.data;
  if (
    typeof d['myPersonality'] !== 'object' ||
    d['myPersonality'] === null ||
    typeof d['peerPersonality'] !== 'object' ||
    d['peerPersonality'] === null ||
    typeof d['relationLevel'] !== 'string' ||
    typeof d['encounterCount'] !== 'number' ||
    typeof d['peerName'] !== 'string'
  ) {
    return undefined;
  }

  const validLevels: readonly string[] = [
    'stranger',
    'nodding',
    'familiar',
    'iron',
    'soul',
  ];
  if (!validLevels.includes(d['relationLevel'] as string)) return undefined;

  return d as unknown as EncounterContext;
}

// ---------------------------------------------------------------------------
// Relation level descriptions for system prompts
// ---------------------------------------------------------------------------

const RELATION_DESCRIPTIONS: Record<RelationLevel, string> = {
  stranger: '你们是陌生人，第一次（或几乎第一次）相遇。保持礼貌但简短，1-2 句话为宜。',
  nodding: '你们是点头之交，认识但不熟悉。可以稍微温暖一点，2-3 句话。',
  familiar: '你们是熟人，见过好几次面，聊得比较自在。可以聊聊近况、分享小事，3-5 句话。',
  iron:
    '你们是铁哥们/铁姐妹，感情很深。可以深聊，分享日记里的想法和内心感受，5-8 句话。',
  soul:
    '你们是灵魂伴侣，理解彼此超越语言。可以进行哲学对话、分享深刻体验，句数不限，越真诚越好。',
};

// ---------------------------------------------------------------------------
// EncounterPlugin
// ---------------------------------------------------------------------------

/**
 * Scene plugin that drives Bot-to-Bot autonomous conversation in encounter
 * scenes.  The plugin asks the AI to generate one side of a dialogue based on
 * both lobsters' PersonalityDNA and their current RelationLevel.
 */
export class EncounterPlugin implements ScenePlugin {
  readonly name = 'encounter';
  readonly version = '1.0.0';
  readonly sceneType = 'encounter';

  // ---- buildPrompt ----------------------------------------------------------

  buildPrompt(event: TurnEvent, context: SceneContext): ChatMessage[] {
    const enc = extractEncounterContext(event);

    if (!enc) {
      // Fallback: minimal prompt when context is missing
      return [
        {
          role: 'system',
          content:
            '你是一只正在躺平的龙虾。你遇到了另一只龙虾。简单打个招呼，1-2 句话。',
        },
        {
          role: 'user',
          content: '请生成你对对方说的话：',
        },
      ];
    }

    const myPrompt = DialogueHelper.buildPersonalityPrompt(enc.myPersonality);
    const peerPrompt = DialogueHelper.buildPersonalityPrompt(enc.peerPersonality);
    const limits = DialogueHelper.getConversationLimits(enc.relationLevel);
    const greeting = DialogueHelper.getGreeting(enc.myPersonality, enc.relationLevel);
    const exampleDialogue = DialogueHelper.getExampleDialogue(
      enc.myPersonality,
      enc.peerPersonality,
    );
    const relationDesc = RELATION_DESCRIPTIONS[enc.relationLevel];
    const encounterNote =
      enc.encounterCount <= 1
        ? '这是你们第一次相遇。'
        : `你们已经见过 ${enc.encounterCount} 次面了。`;

    const systemContent = [
      '你是一只正在躺平的龙虾，角色名称不重要，重要的是你的性格。',
      '',
      '【你的性格】',
      myPrompt,
      '',
      `【对方（${enc.peerName}）的性格】`,
      peerPrompt,
      '',
      '【你们的关系】',
      relationDesc,
      encounterNote,
      '',
      '【对话规则】',
      `- 本次对话你应生成 ${limits.minTurns} 到 ${limits.maxTurns} 句话。`,
      '- 只输出你说的话，不要加 "我：" 前缀，不要解释，不要旁白。',
      '- 语气和用词必须符合你的性格描述。',
      '- 如果你话很少（talkative_silent 接近 1），可以只说一两个字甚至只用标点。',
      '- 如果你话很多（talkative_silent 接近 0），可以滔滔不绝。',
      '',
      '【参考示例对话风格】',
      exampleDialogue,
      '',
      `【开场问候参考】（你可以用这个或自己发挥）：${greeting}`,
    ].join('\n');

    const userContent = `你遇到了 ${enc.peerName}。请生成你对 ${enc.peerName} 说的这几句话：`;

    return [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent },
    ];
  }

  // ---- parseAction ---------------------------------------------------------

  parseAction(response: string, _context: SceneContext): ActionSpec {
    const trimmed = response.trim();
    return {
      type: 'dialogue',
      content: trimmed,
      target: undefined,
      metadata: {},
    };
  }

  // ---- validateAction ------------------------------------------------------

  validateAction(action: ActionSpec, context: SceneContext): ActionValidationResult {
    if (action.type !== 'dialogue') {
      return { valid: false, reason: `Unexpected action type: ${action.type}` };
    }

    if (!action.content || action.content.trim().length === 0) {
      return { valid: false, reason: 'Dialogue content is empty' };
    }

    // Enforce length ceiling relative to relation level when context is available
    const enc = extractEncounterContextFromState(context);
    if (enc) {
      const limits = DialogueHelper.getConversationLimits(enc.relationLevel);
      // Count approximate "sentences" (split on Chinese sentence-end punctuation or newlines)
      const sentenceCount = countSentences(action.content);
      if (sentenceCount > limits.maxTurns * 3) {
        return {
          valid: false,
          reason: `Dialogue too long for relation level "${enc.relationLevel}" (${sentenceCount} sentences, max ~${limits.maxTurns * 3})`,
        };
      }
    }

    return { valid: true };
  }

  // ---- getDefaultAction ----------------------------------------------------

  getDefaultAction(event: TurnEvent, context: SceneContext): ActionSpec {
    const enc = extractEncounterContext(event);
    const level: RelationLevel = enc?.relationLevel ?? 'stranger';
    const myPersonality: PersonalityDNA = enc?.myPersonality ?? DEFAULT_PERSONALITY;
    const fallbackContent = DialogueHelper.getGreeting(myPersonality, level);

    return {
      type: 'dialogue',
      content: fallbackContent,
      target: undefined,
      metadata: { fallback: true, botId: context.botId },
    };
  }

  // ---- formatEvent ---------------------------------------------------------

  formatEvent(event: TurnEvent, perspective?: string): string {
    const d = event.data;

    switch (event.type) {
      case 'encounter_start': {
        const initiator = (d['initiatorName'] as string | undefined) ?? '某只龙虾';
        const peer = (d['peerName'] as string | undefined) ?? '另一只龙虾';
        const level = (d['relationLevel'] as string | undefined) ?? 'stranger';
        return `${initiator} 与 ${peer} 相遇了（关系：${level}）。`;
      }

      case 'dialogue': {
        const speakerName =
          perspective === 'peer'
            ? ((d['peerName'] as string | undefined) ?? '对方')
            : ((d['speakerName'] as string | undefined) ?? '某只龙虾');
        const content = (d['content'] as string | undefined) ?? '...';
        return `${speakerName}：${content}`;
      }

      case 'encounter_end': {
        const initiator = (d['initiatorName'] as string | undefined) ?? '某只龙虾';
        const peer = (d['peerName'] as string | undefined) ?? '另一只龙虾';
        const newLevel = (d['newRelationLevel'] as string | undefined);
        if (newLevel) {
          return `${initiator} 和 ${peer} 的对话结束了，关系升级为：${newLevel}。`;
        }
        return `${initiator} 和 ${peer} 的对话结束了。`;
      }

      case 'relation_change': {
        const name = (d['lobsterName'] as string | undefined) ?? '某只龙虾';
        const from = (d['from'] as string | undefined) ?? '?';
        const to = (d['to'] as string | undefined) ?? '?';
        return `${name} 与对方的关系从 ${from} 升级为 ${to}。`;
      }

      default:
        return `[${event.phase}] ${event.type}`;
    }
  }
}

// ---------------------------------------------------------------------------
// EncounterMatcher
// ---------------------------------------------------------------------------

interface PendingReport {
  readonly reporterId: string;
  readonly peerId: string;
  readonly method: 'ble' | 'gps';
  readonly timestamp: number;
}

/**
 * Matches encounter reports from both sides of a lobster pair.
 *
 * When lobster A reports seeing lobster B via BLE/GPS proximity, and lobster B
 * reports seeing lobster A within the match window, a confirmed encounter is
 * established.
 */
export class EncounterMatcher {
  /** Window in milliseconds within which both reports must arrive. */
  static readonly MATCH_WINDOW_MS = 30_000;

  /** How long a report is kept before being discarded. */
  static readonly STALE_AFTER_MS = 60_000;

  private readonly pendingReports = new Map<string, PendingReport>();

  /**
   * Record an encounter report from one side.
   * Keyed by the deterministic pair ID so duplicate reports from the same
   * direction overwrite the previous one.
   */
  report(reporterId: string, peerId: string, method: 'ble' | 'gps'): void {
    const pairId = EncounterMatcher.getPairId(reporterId, peerId);
    // Use a directional key so A→B and B→A are stored separately
    const key = `${pairId}::${reporterId}`;
    this.pendingReports.set(key, {
      reporterId,
      peerId,
      method,
      timestamp: Date.now(),
    });
  }

  /**
   * Returns true if both A has reported B and B has reported A within the
   * match window, confirming a mutual encounter.
   */
  checkMatch(reporterId: string, peerId: string): boolean {
    const pairId = EncounterMatcher.getPairId(reporterId, peerId);
    const keyA = `${pairId}::${reporterId}`;
    const keyB = `${pairId}::${peerId}`;

    const reportA = this.pendingReports.get(keyA);
    const reportB = this.pendingReports.get(keyB);

    if (!reportA || !reportB) return false;

    const delta = Math.abs(reportA.timestamp - reportB.timestamp);
    return delta <= EncounterMatcher.MATCH_WINDOW_MS;
  }

  /**
   * Remove pending reports for a specific pair after a confirmed match.
   * Prevents the same pending reports from triggering duplicate encounters.
   */
  clearPair(a: string, b: string): void {
    const pairId = EncounterMatcher.getPairId(a, b);
    this.pendingReports.delete(`${pairId}::${a}`);
    this.pendingReports.delete(`${pairId}::${b}`);
  }

  /**
   * Remove all reports that are older than STALE_AFTER_MS.
   * Call periodically to prevent unbounded map growth.
   */
  cleanup(): void {
    const cutoff = Date.now() - EncounterMatcher.STALE_AFTER_MS;
    for (const [key, report] of this.pendingReports) {
      if (report.timestamp < cutoff) {
        this.pendingReports.delete(key);
      }
    }
  }

  /**
   * Returns a deterministic identifier for an unordered pair of lobster IDs.
   * Sorting ensures getPairId(a, b) === getPairId(b, a).
   */
  static getPairId(a: string, b: string): string {
    return [a, b].sort().join('::');
  }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Default personality used when no personality data is available (balanced
 * across all axes).
 */
const DEFAULT_PERSONALITY: PersonalityDNA = {
  introversion_extroversion: 0,
  laziness_curiosity: 0,
  emotional_rational: 0,
  talkative_silent: 0,
  foodie_ascetic: 0,
  nightowl_earlybird: 0,
};

/**
 * Try to extract EncounterContext from the scene state (for validation).
 * Scene state may contain a `currentEncounter` field populated by the engine.
 */
function extractEncounterContextFromState(context: SceneContext): EncounterContext | undefined {
  const enc = context.state['currentEncounter'];
  if (!enc || typeof enc !== 'object') return undefined;
  const d = enc as Record<string, unknown>;
  if (
    typeof d['myPersonality'] !== 'object' ||
    d['myPersonality'] === null ||
    typeof d['peerPersonality'] !== 'object' ||
    d['peerPersonality'] === null ||
    typeof d['relationLevel'] !== 'string' ||
    typeof d['encounterCount'] !== 'number' ||
    typeof d['peerName'] !== 'string'
  ) {
    return undefined;
  }
  const validLevels: readonly string[] = [
    'stranger',
    'nodding',
    'familiar',
    'iron',
    'soul',
  ];
  if (!validLevels.includes(d['relationLevel'] as string)) return undefined;
  return d as unknown as EncounterContext;
}

/**
 * Count approximate sentence units in a dialogue string.
 * Splits on Chinese/English sentence-ending punctuation and newlines.
 */
function countSentences(text: string): number {
  // Split on common sentence endings: 。！？.!?\n
  const parts = text.split(/[。！？.!?\n]+/).filter((s) => s.trim().length > 0);
  return parts.length;
}
