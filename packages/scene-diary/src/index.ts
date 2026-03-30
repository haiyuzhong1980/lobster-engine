// @lobster-engine/scene-diary — Diary scene plugin

import type {
  ScenePlugin,
  SceneContext,
  ChatMessage,
  TurnEvent,
  ActionSpec,
  ActionValidationResult,
  PersonalityDNA,
} from '@lobster-engine/core';

export type { PersonalityDNA } from '@lobster-engine/core';

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

export type ActivityType =
  | 'idle'
  | 'walking'
  | 'running'
  | 'cycling'
  | 'subway'
  | 'bus'
  | 'driving'
  | 'train'
  | 'plane'
  | 'boat'
  | 'sleeping'
  | 'eating'
  | 'listening_music'
  | 'phone_call'
  | 'charging';

export type EmotionType =
  | 'happy'
  | 'sleepy'
  | 'curious'
  | 'hungry'
  | 'warm'
  | 'proud'
  | 'surprised'
  | 'zen';

export interface ActivityEntry {
  readonly time: string;     // HH:MM
  readonly type: ActivityType;
  readonly duration: number; // minutes
}

export interface EncounterSummary {
  readonly time: string;
  readonly peerName: string;
  readonly isNew: boolean;
  readonly relationLevel: string;
}

export interface DiaryInput {
  readonly date: string;                              // YYYY-MM-DD
  readonly activities: readonly ActivityEntry[];
  readonly encounters: readonly EncounterSummary[];
  readonly weather: { condition: string; temperature: number };
  readonly personality: PersonalityDNA;
  readonly totalSteps: number;
  readonly dominantMood: EmotionType;
}

// ---------------------------------------------------------------------------
// Diary builder types
// ---------------------------------------------------------------------------

export interface TimelineItem {
  readonly time: string;
  readonly icon: string;
  readonly description: string;
  readonly isHighlight: boolean;
}

export interface DiarySummaryData {
  readonly lyingFlatIndex: number;
  readonly totalSteps: number;
  readonly encounterCount: number;
  readonly dominantMood: string;
  readonly personalityQuoteStyle: string;
}

// ---------------------------------------------------------------------------
// Activity → Lobster description mapping
// ---------------------------------------------------------------------------

const ACTIVITY_DESCRIPTIONS: Readonly<Record<ActivityType, string>> = {
  idle: '在吊床上发呆，偶尔吹泡泡',
  walking: '在海底沙滩上散步',
  running: '在珊瑚礁之间急速游泳',
  cycling: '骑着海马在海底大道上兜风',
  subway: '坐在海底隧道列车里看风景',
  bus: '被挤在沙丁鱼巴士里',
  driving: '开着大贝壳车',
  train: '坐旗鱼特快穿越深海',
  plane: '骑飞鱼冲出了海面！看到了天空！',
  boat: '搭着漂流木顺着洋流漂',
  sleeping: '钻进海螺壳里美美地睡了一觉',
  eating: '在龙虾食堂吃了一顿海底comfort food',
  listening_music: '戴着贝壳耳机沉浸在海浪音乐里',
  phone_call: '用海藻电话线和远方的朋友聊天',
  charging: '趴在珊瑚充电桩上默默回血',
};

// Activity → icon mapping
const ACTIVITY_ICONS: Readonly<Record<ActivityType, string>> = {
  idle: '🛌',
  walking: '🐾',
  running: '💨',
  cycling: '🐴',
  subway: '🚇',
  bus: '🐟',
  driving: '🐚',
  train: '🐟',
  plane: '✈️',
  boat: '🌊',
  sleeping: '💤',
  eating: '🍽️',
  listening_music: '🎵',
  phone_call: '📞',
  charging: '⚡',
};

// Idle-like activities that contribute to the lying-flat index
const IDLE_ACTIVITIES = new Set<ActivityType>([
  'idle',
  'sleeping',
  'charging',
  'listening_music',
]);

// ---------------------------------------------------------------------------
// DiaryBuilder
// ---------------------------------------------------------------------------

export class DiaryBuilder {
  /**
   * Build a chronologically sorted timeline from activity entries.
   */
  static buildTimeline(activities: readonly ActivityEntry[]): readonly TimelineItem[] {
    const sorted = [...activities].sort((a, b) => a.time.localeCompare(b.time));

    return sorted.map((entry) => ({
      time: entry.time,
      icon: ACTIVITY_ICONS[entry.type],
      description: DiaryBuilder.activityToLobsterDescription(entry.type),
      isHighlight: entry.type === 'plane' || entry.type === 'running' || entry.duration >= 60,
    }));
  }

  /**
   * Calculate lying-flat index (0–5 stars).
   * More idle/passive time → higher score.
   * Fewer total steps → higher score.
   */
  static calculateLyingFlatIndex(
    activities: readonly ActivityEntry[],
    totalSteps: number,
  ): number {
    const totalMinutes = activities.reduce((sum, a) => sum + a.duration, 0);
    if (totalMinutes === 0) return 5;

    const idleMinutes = activities
      .filter((a) => IDLE_ACTIVITIES.has(a.type))
      .reduce((sum, a) => sum + a.duration, 0);

    const idleRatio = idleMinutes / totalMinutes;

    // Step penalty: 10000+ steps → −2 from raw score; <2000 → no penalty
    const stepPenalty = Math.min(2, totalSteps / 5000);

    const rawScore = idleRatio * 5 - stepPenalty;
    const clamped = Math.max(0, Math.min(5, rawScore));

    return Math.round(clamped);
  }

  /**
   * Aggregate summary statistics for the diary day.
   */
  static buildSummary(input: DiaryInput): DiarySummaryData {
    return {
      lyingFlatIndex: DiaryBuilder.calculateLyingFlatIndex(
        input.activities,
        input.totalSteps,
      ),
      totalSteps: input.totalSteps,
      encounterCount: input.encounters.length,
      dominantMood: input.dominantMood,
      personalityQuoteStyle: DiaryBuilder.getQuoteStyle(input.personality),
    };
  }

  /**
   * Map an ActivityType to its lobster-world description.
   */
  static activityToLobsterDescription(type: ActivityType): string {
    return ACTIVITY_DESCRIPTIONS[type];
  }

  /**
   * Determine the dominant quote/writing style from personality DNA.
   */
  static getQuoteStyle(
    personality: PersonalityDNA,
  ): 'philosophical' | 'foodie' | 'silent' | 'social' | 'curious' {
    // Normalize each trait from -100..+100 to 0..1 for score calculations
    const norm = (v: number): number => (v + 100) / 200;

    const emotional_rational = norm(personality.emotional_rational);
    const talkative_silent = norm(personality.talkative_silent);
    const foodie_ascetic = norm(personality.foodie_ascetic);
    const introversion_extroversion = norm(personality.introversion_extroversion);
    const laziness_curiosity = norm(personality.laziness_curiosity);

    const scores: Readonly<
      Record<'philosophical' | 'foodie' | 'silent' | 'social' | 'curious', number>
    > = {
      philosophical: emotional_rational * (1 - talkative_silent),
      foodie: foodie_ascetic,
      silent: 1 - talkative_silent,
      social: introversion_extroversion,
      curious: laziness_curiosity,
    };

    // Return the style with the highest score; philosophical wins ties
    let best: 'philosophical' | 'foodie' | 'silent' | 'social' | 'curious' = 'philosophical';
    let bestScore = -1;

    for (const [style, score] of Object.entries(scores) as Array<
      [keyof typeof scores, number]
    >) {
      if (score > bestScore) {
        bestScore = score;
        best = style;
      }
    }

    return best;
  }
}

// ---------------------------------------------------------------------------
// Prompt helpers
// ---------------------------------------------------------------------------

function buildPersonaDescription(personality: PersonalityDNA): string {
  const style = DiaryBuilder.getQuoteStyle(personality);

  const styleDescriptions: Readonly<Record<typeof style, string>> = {
    philosophical: '哲学沉思派龙虾，写日记喜欢深度内省，常常一句话引发宇宙级思考',
    foodie: '吃货派龙虾，任何事情都能扯到食物，每个情绪都用食材来比喻',
    silent: '沉默派龙虾，日记极简，有时候一句话甚至一个字就结束了，沉默是金',
    social: '社交派龙虾，日记重心在于遇到了谁、聊了什么，人际关系是一切',
    curious: '好奇派龙虾，对今天看到的每件新鲜事都充满疑问和探索欲',
  };

  return styleDescriptions[style];
}

function buildActivityTimeline(activities: readonly ActivityEntry[]): string {
  if (activities.length === 0) return '（今天什么也没做，只是存在着）';

  const timeline = DiaryBuilder.buildTimeline(activities);
  return timeline
    .map(
      (item) =>
        `  ${item.time} ${item.icon} ${item.description}（${
          activities.find((a) => a.time === item.time)?.duration ?? 0
        }分钟）`,
    )
    .join('\n');
}

function buildEncounterSection(encounters: readonly EncounterSummary[]): string {
  if (encounters.length === 0) return '今天一个同伴都没遇到，独自躺平。';

  return encounters
    .map(
      (e) =>
        `  ${e.time} 遇到了 ${e.peerName}（${e.isNew ? '新朋友！' : '老相识'}，关系等级：${e.relationLevel}）`,
    )
    .join('\n');
}

function buildStyleGuide(
  style: 'philosophical' | 'foodie' | 'silent' | 'social' | 'curious',
): string {
  const guides: Readonly<Record<typeof style, string>> = {
    philosophical:
      '写作风格：内省散文，每段活动都引申出人生感悟，结尾必须有一句深邃的"龙虾箴言"。',
    foodie:
      '写作风格：所有情绪和事件都要类比成食物——散步如同慢炖的高汤，睡觉如同发酵中的面团。结尾用食谱风格总结今天。',
    silent:
      '写作风格：极简主义，全篇不超过3句话。可以只写"。"或一个词。越简单越好。',
    social:
      '写作风格：所有内容围绕今天的相遇展开，对没遇到朋友的时段一笔带过，重点刻画每次相遇的细节和感受。',
    curious:
      '写作风格：好奇心驱动，对今天经历的每件事都提出疑问，用"为什么……""我想知道……"开头。',
  };

  return guides[style];
}

function buildLyingFlatSection(lyingFlatIndex: number): string {
  const stars = '⭐'.repeat(lyingFlatIndex) + '☆'.repeat(5 - lyingFlatIndex);
  const labels = ['拼命工作，龙虾界卷王', '比较忙碌', '平衡得还不错', '相当躺平', '完美躺平，人生赢家'];
  const label = labels[Math.min(lyingFlatIndex, labels.length - 1)];
  return `今日躺平指数：${stars}（${label}）`;
}

// ---------------------------------------------------------------------------
// DiaryPlugin
// ---------------------------------------------------------------------------

export class DiaryPlugin implements ScenePlugin {
  readonly name = 'diary';
  readonly version = '1.0.0';
  readonly sceneType = 'diary';

  // ---- buildPrompt ----------------------------------------------------------

  buildPrompt(event: TurnEvent, _context: SceneContext): ChatMessage[] {
    const input = event.data as unknown as DiaryInput;
    const style = DiaryBuilder.getQuoteStyle(input.personality);
    const lyingFlatIndex = DiaryBuilder.calculateLyingFlatIndex(
      input.activities,
      input.totalSteps,
    );

    const systemContent = [
      '你是一只会写日记的龙虾，生活在一个充满珊瑚礁、吊床和海底美食的世界里。',
      `你的性格：${buildPersonaDescription(input.personality)}`,
      '',
      `【今日基本信息】`,
      `日期：${input.date}`,
      `天气：${input.weather.condition}，温度 ${input.weather.temperature}°C`,
      `今日步数：${input.totalSteps} 步`,
      `主导情绪：${input.dominantMood}`,
      '',
      `【今日活动时间轴】`,
      buildActivityTimeline(input.activities),
      '',
      `【今日相遇记录】`,
      buildEncounterSection(input.encounters),
      '',
      `【躺平评估】`,
      buildLyingFlatSection(lyingFlatIndex),
      '',
      `【写作要求】`,
      buildStyleGuide(style),
      '日记必须包含：',
      '  1. 开头用第一人称写今天的整体感受（1-2句）',
      '  2. 按时间线描述今天的主要活动（结合上方活动表）',
      '  3. 提及今日的天气感受',
      '  4. 如有相遇，写出对应的心情',
      `  5. 结尾必须有一句"龙虾名言"（风格：${style}）`,
      `  6. 日记最后一行格式为：今日躺平指数 ${'⭐'.repeat(lyingFlatIndex)}${'☆'.repeat(5 - lyingFlatIndex)}`,
      '语言：中文，口吻真实自然，符合龙虾人格。',
    ].join('\n');

    return [
      { role: 'system', content: systemContent },
      {
        role: 'user',
        content: `请根据以上信息，为 ${input.date} 写一篇完整的龙虾日记。`,
      },
    ];
  }

  // ---- parseAction ---------------------------------------------------------

  parseAction(response: string, _context: SceneContext): ActionSpec {
    const trimmed = response.trim();

    // Extract lying-flat index from last line if present (⭐☆ pattern)
    const starLineMatch = /今日躺平指数\s*([⭐☆]+)/.exec(trimmed);
    const starLine = starLineMatch?.[0] ?? '';
    const starCount = (starLineMatch?.[1] ?? '').split('').filter((c) => c === '⭐').length;

    return {
      type: 'diary_entry',
      content: trimmed,
      target: undefined,
      metadata: {
        lyingFlatIndex: starCount,
        hasStarRating: starLine !== '',
        wordCount: trimmed.length,
      },
    };
  }

  // ---- validateAction ------------------------------------------------------

  validateAction(action: ActionSpec, _context: SceneContext): ActionValidationResult {
    if (action.type !== 'diary_entry') {
      return { valid: false, reason: `Expected diary_entry, got ${action.type}` };
    }

    if (!action.content || action.content.trim().length === 0) {
      return { valid: false, reason: 'Diary content is empty' };
    }

    if (action.content.trim().length < 10) {
      return { valid: false, reason: 'Diary content is too short' };
    }

    return { valid: true };
  }

  // ---- getDefaultAction ----------------------------------------------------

  getDefaultAction(event: TurnEvent, _context: SceneContext): ActionSpec {
    const input = event.data as unknown as Partial<DiaryInput>;
    const date = input.date ?? new Date().toISOString().slice(0, 10);
    const mood = input.dominantMood ?? 'zen';
    const steps = input.totalSteps ?? 0;
    const lyingFlatIndex = input.activities
      ? DiaryBuilder.calculateLyingFlatIndex(input.activities, steps)
      : 5;

    const stars = '⭐'.repeat(lyingFlatIndex) + '☆'.repeat(5 - lyingFlatIndex);
    const fallbackContent = [
      `${date}，天气不明，心情${mood}。`,
      '今天龙虾在吊床上发了一整天呆，偶尔吹了几个泡泡。',
      '没有什么特别的事情发生，但这本身就是一件特别的事。',
      '龙虾名言：躺平不是放弃，是与重力和解。',
      `今日躺平指数 ${stars}`,
    ].join('\n');

    return {
      type: 'diary_entry',
      content: fallbackContent,
      target: undefined,
      metadata: {
        fallback: true,
        lyingFlatIndex,
      },
    };
  }

  // ---- formatEvent ---------------------------------------------------------

  formatEvent(event: TurnEvent, perspective?: string): string {
    const type = event.type;
    const data = event.data;

    switch (type) {
      case 'diary_generated':
        return `[${data['date'] ?? event.timestamp}] 龙虾日记已生成（${data['wordCount'] ?? 0}字）`;
      case 'diary_shared':
        return perspective === 'owner'
          ? `你把今天的日记分享给了 ${data['recipient'] ?? '朋友'}。`
          : `${data['authorName'] ?? '某只龙虾'} 分享了今天的日记。`;
      case 'diary_liked':
        return `${data['likerName'] ?? '一位朋友'} 给你的日记点了个赞 ❤️`;
      default:
        return `[${event.phase}] ${type}`;
    }
  }
}
