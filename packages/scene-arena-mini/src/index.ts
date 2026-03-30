// @lobster-engine/scene-arena-mini — Mini arena scene plugin
// Three mini-game modes: debate (嘴炮道场), lying flat (躺平比拼), counting (协作数数)

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
// Types
// ---------------------------------------------------------------------------

export type ArenaMode = 'debate' | 'lying_flat' | 'counting';

export interface ArenaRewardResult {
  readonly lazyCoin: number;
  readonly experience: number;
  readonly lobsterReaction: string;
}

// ---------------------------------------------------------------------------
// Debate topics pool
// ---------------------------------------------------------------------------

export const DEBATE_TOPICS: readonly string[] = [
  '上班摸鱼是不是一种自我修炼？',
  '午觉到底应该睡15分钟还是2小时？',
  '外卖和做饭，哪个更躺平？',
  '周一应不应该被取消？',
  '如果龙虾统治世界，第一条法律是什么？',
  '早起的虾有虫吃，但晚起的虾有外卖',
  '在家办公算不算一种进化？',
  '躺平是不是一种哲学？',
  '加班到底算不算另一种形式的有氧运动？',
  '如果可以选择，你愿意当一只永远不用工作的龙虾吗？',
];

// ---------------------------------------------------------------------------
// TopicPicker
// ---------------------------------------------------------------------------

export class TopicPicker {
  /**
   * Pick a random topic from the pool.
   */
  static pickRandom(): string {
    const index = Math.floor(Math.random() * DEBATE_TOPICS.length);
    return DEBATE_TOPICS[index] as string;
  }

  /**
   * Pick a topic that best suits both lobsters' combined personality.
   *
   * Scoring heuristic:
   *   - High average foodie score   → prefer food-adjacent topics (外卖/做饭)
   *   - High average laziness score → prefer laziness topics (躺平/午觉/摸鱼)
   *   - High average talkative     → prefer debate-friendly open questions
   *   Falls back to random when scores are all near zero.
   */
  static pickForPair(
    personalityA: PersonalityDNA,
    personalityB: PersonalityDNA,
  ): string {
    const avgFoodie =
      (personalityA.foodie_ascetic + personalityB.foodie_ascetic) / 2;
    const avgLazy =
      ((-personalityA.laziness_curiosity) + (-personalityB.laziness_curiosity)) / 2;
    const avgTalkative =
      (personalityA.talkative_silent + personalityB.talkative_silent) / 2;

    // Map personality scores to topic index preferences
    interface TopicCandidate {
      readonly index: number;
      readonly score: number;
    }

    const scored: TopicCandidate[] = [
      { index: 0, score: avgLazy * 0.8 + avgTalkative * 0.2 },      // 摸鱼
      { index: 1, score: avgLazy * 1.0 },                             // 午觉
      { index: 2, score: avgFoodie * 1.0 + avgLazy * 0.3 },          // 外卖/做饭
      { index: 3, score: avgLazy * 0.6 + avgTalkative * 0.4 },       // 周一
      { index: 4, score: avgTalkative * 0.9 },                        // 龙虾统治世界
      { index: 5, score: avgFoodie * 0.5 + avgLazy * 0.5 },          // 早起/外卖
      { index: 6, score: avgLazy * 0.7 + avgTalkative * 0.3 },       // 在家办公
      { index: 7, score: avgLazy * 0.9 + avgTalkative * 0.1 },       // 躺平哲学
      { index: 8, score: avgLazy * 0.6 + avgTalkative * 0.4 },       // 加班/有氧
      { index: 9, score: avgLazy * 0.8 + avgTalkative * 0.2 },       // 永远不用工作
    ];

    // Find the maximum score
    let best = scored[0] as TopicCandidate;
    for (const candidate of scored) {
      if (candidate.score > best.score) {
        best = candidate;
      }
    }

    // If all scores are too close to zero, fall back to random
    if (Math.abs(best.score) < 5) {
      return TopicPicker.pickRandom();
    }

    return DEBATE_TOPICS[best.index] as string;
  }
}

// ---------------------------------------------------------------------------
// ArenaRewards
// ---------------------------------------------------------------------------

/**
 * Reward calculator for arena mini-games.
 *
 * Key design rule: win and lose yield the SAME lazyCoin amount — the only
 * exception is a draw, which grants double coins. Participation always grants
 * experience regardless of outcome.
 */
export class ArenaRewards {
  static calculate(
    mode: ArenaMode,
    result: 'win' | 'lose' | 'draw',
  ): ArenaRewardResult {
    switch (mode) {
      case 'debate':
        return ArenaRewards.debateReward(result);
      case 'lying_flat':
        return ArenaRewards.lyingFlatReward(result);
      case 'counting':
        return ArenaRewards.countingReward(result);
    }
  }

  private static debateReward(result: 'win' | 'lose' | 'draw'): ArenaRewardResult {
    switch (result) {
      case 'win':
        return {
          lazyCoin: 5,
          experience: 10,
          lobsterReaction: '说得好！（其实输了也没关系）',
        };
      case 'lose':
        return {
          lazyCoin: 5,
          experience: 10,
          lobsterReaction: '虽败犹荣，继续躺',
        };
      case 'draw':
        return {
          lazyCoin: 10,
          experience: 15,
          lobsterReaction: '和平是最好的结果',
        };
    }
  }

  private static lyingFlatReward(result: 'win' | 'lose' | 'draw'): ArenaRewardResult {
    switch (result) {
      case 'win':
        return {
          lazyCoin: 8,
          experience: 12,
          lobsterReaction: '你是真正的躺平大师',
        };
      case 'lose':
        return {
          lazyCoin: 8,
          experience: 12,
          lobsterReaction: '下次我们一起躺更久',
        };
      case 'draw':
        return {
          lazyCoin: 16,
          experience: 18,
          lobsterReaction: '两只龙虾同时躺平，创造历史',
        };
    }
  }

  private static countingReward(result: 'win' | 'lose' | 'draw'): ArenaRewardResult {
    // Counting is always cooperative — result is always 'draw' (complete)
    // Callers may also pass 'win'/'lose' for partial completions
    switch (result) {
      case 'win':
      case 'lose':
      case 'draw':
        return {
          lazyCoin: 6,
          experience: 8,
          lobsterReaction: '我们数到100了！虽然不知道为什么要数',
        };
    }
  }
}

// ---------------------------------------------------------------------------
// Personality style helpers
// ---------------------------------------------------------------------------

type PersonalityStyle = 'philosophical' | 'foodie' | 'social' | 'silent' | 'default';

/**
 * Derive the dominant personality style from a PersonalityDNA.
 * Used to select appropriate prompt flavour.
 */
function dominantStyle(dna: PersonalityDNA): PersonalityStyle {
  // Build ranked candidates and return the one with the highest absolute value
  const candidates: Array<{ style: PersonalityStyle; score: number }> = [
    { style: 'silent', score: -dna.talkative_silent },              // very silent
    { style: 'foodie', score: dna.foodie_ascetic },                  // strong foodie
    { style: 'philosophical', score: -dna.laziness_curiosity },      // very lazy → philosophical
    { style: 'social', score: dna.introversion_extroversion },       // very extroverted
  ];

  let best: { style: PersonalityStyle; score: number } = {
    style: 'default',
    score: 30, // threshold: only override when score is clearly dominant (-100..+100 scale)
  };

  for (const c of candidates) {
    if (c.score > best.score) {
      best = c;
    }
  }

  return best.style;
}

/**
 * Build a short style instruction string for prompt injection.
 */
function styleInstruction(style: PersonalityStyle): string {
  switch (style) {
    case 'philosophical':
      return '你是一只爱引用哲学名言的深思龙虾，每句话都要带上玄学感悟，引经据典。';
    case 'foodie':
      return '你是一只超级吃货龙虾，所有论据都必须和食物挂钩，比如饺子、小龙虾、火锅。';
    case 'social':
      return '你是一只社交达人龙虾，喜欢拉其他龙虾作为论据见证人，声音洪亮充满感染力。';
    case 'silent':
      return '你是一只话很少的沉默龙虾，只说一句话，但这句话要有致命的杀伤力。';
    default:
      return '你是一只普通但有点搞笑的躺平龙虾，用轻松随意的口吻发言。';
  }
}

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

interface ArenaMiniState {
  readonly playerA: string;
  readonly playerB: string;
  readonly personalityA?: PersonalityDNA;
  readonly personalityB?: PersonalityDNA;
  readonly topic?: string;
  readonly currentNumber?: number;
  readonly lyingFlatResult?: 'win' | 'lose' | 'draw';
  readonly debatePosition?: 'pro' | 'con';
  readonly turnCount?: number;
}

function getState(context: SceneContext): ArenaMiniState {
  return context.state as unknown as ArenaMiniState;
}

function getMode(event: TurnEvent): ArenaMode {
  return (event.data['mode'] as ArenaMode) ?? 'debate';
}

// ---------------------------------------------------------------------------
// ArenaMiniPlugin
// ---------------------------------------------------------------------------

export class ArenaMiniPlugin implements ScenePlugin {
  readonly name = 'arena-mini';
  readonly version = '1.0.0';
  readonly sceneType = 'arena-mini';

  // ---- buildPrompt ----------------------------------------------------------

  buildPrompt(event: TurnEvent, context: SceneContext): ChatMessage[] {
    const mode = getMode(event);
    switch (mode) {
      case 'debate':
        return this.buildDebatePrompt(event, context);
      case 'lying_flat':
        return this.buildLyingFlatPrompt(event, context);
      case 'counting':
        return this.buildCountingPrompt(event, context);
    }
  }

  /**
   * Debate mode (嘴炮道场).
   *
   * Both lobsters argue a random topic for 3 turns each.  The personality of
   * the speaking lobster shapes the style of argument.  The side whose
   * arguments are more personality-aligned ultimately wins.
   */
  private buildDebatePrompt(event: TurnEvent, context: SceneContext): ChatMessage[] {
    const state = getState(context);
    const topic = (event.data['topic'] as string | undefined) ?? state.topic ?? TopicPicker.pickRandom();
    const position = (event.data['position'] as 'pro' | 'con' | undefined) ?? state.debatePosition ?? 'pro';
    const turnCount = (event.data['turnCount'] as number | undefined) ?? state.turnCount ?? 1;

    // Determine which personality DNA applies to the speaking bot
    const speakingPersonality: PersonalityDNA | undefined =
      context.botId === state.playerA ? state.personalityA : state.personalityB;

    const style = speakingPersonality
      ? styleInstruction(dominantStyle(speakingPersonality))
      : styleInstruction('default');

    const positionLabel = position === 'pro' ? '正方（支持）' : '反方（反对）';
    const positionInstruction =
      position === 'pro'
        ? `你是${positionLabel}，必须旗帜鲜明地支持这个观点，给出有趣但合理的论据。`
        : `你是${positionLabel}，必须旗帜鲜明地反对这个观点，给出有趣但合理的反驳。`;

    const systemContent = [
      `你正在参加一场轻松搞笑的龙虾辩论赛，辩题是：「${topic}」`,
      positionInstruction,
      style,
      `这是第 ${turnCount}/3 轮发言。回复限制在2-4句话以内，要幽默、有个性，符合龙虾身份。`,
      '不要使用 Markdown 格式，直接输出发言内容。',
    ].join('\n');

    const userContent = `请以${positionLabel}的身份，针对辩题「${topic}」发表第 ${turnCount} 轮观点：`;

    return [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent },
    ];
  }

  /**
   * Lying flat mode (躺平比拼).
   *
   * This mode is not AI-driven for the competition itself — it is a timer
   * comparison.  AI only generates the lobster's reaction to the result.
   */
  private buildLyingFlatPrompt(event: TurnEvent, context: SceneContext): ChatMessage[] {
    const state = getState(context);
    const result = (event.data['result'] as 'win' | 'lose' | 'draw' | undefined) ?? 'draw';

    const speakingPersonality: PersonalityDNA | undefined =
      context.botId === state.playerA ? state.personalityA : state.personalityB;

    const style = speakingPersonality
      ? styleInstruction(dominantStyle(speakingPersonality))
      : styleInstruction('default');

    const resultDescription =
      result === 'win'
        ? '你赢了！你的手机保持静止的时间更长，你是今天的躺平冠军。'
        : result === 'lose'
          ? '你输了，对方躺平的时间比你更久。但这无所谓，躺平本身就是胜利。'
          : '平局！你们两只龙虾同时放下手机，这是躺平哲学的最高境界。';

    const systemContent = [
      '你是一只参加了躺平比拼的龙虾。',
      style,
      '请对这次比赛的结果作出一个简短的个性反应，1-2句话，符合你的性格特点。',
      '不要使用 Markdown 格式，直接输出反应内容。',
    ].join('\n');

    const userContent = `比赛结果：${resultDescription}\n请以你的龙虾个性反应一下这个结果：`;

    return [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent },
    ];
  }

  /**
   * Counting mode (协作数数).
   *
   * Two lobsters take turns counting from 1 to 100. Each lobster adds
   * personality flair to the numbers they say, based on their DNA.
   */
  private buildCountingPrompt(event: TurnEvent, context: SceneContext): ChatMessage[] {
    const state = getState(context);
    const currentNumber = (event.data['currentNumber'] as number | undefined) ?? state.currentNumber ?? 1;
    const batchSize = 5;
    const endNumber = Math.min(currentNumber + batchSize - 1, 100);

    const speakingPersonality: PersonalityDNA | undefined =
      context.botId === state.playerA ? state.personalityA : state.personalityB;

    const style = speakingPersonality
      ? styleInstruction(dominantStyle(speakingPersonality))
      : styleInstruction('default');

    const domStyle = speakingPersonality ? dominantStyle(speakingPersonality) : 'default';

    const examples = buildCountingExamples(domStyle);

    const systemContent = [
      '你是一只正在参加协作数数游戏的龙虾。',
      style,
      `你需要从 ${currentNumber} 数到 ${endNumber}，每个数字都要加上符合你个性的修饰语或感叹。`,
      `例子：${examples}`,
      '每行一个数字，格式：数字...修饰内容。不要加多余的前缀，直接输出数数内容。',
    ].join('\n');

    const userContent = `请从 ${currentNumber} 数到 ${endNumber}：`;

    return [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent },
    ];
  }

  // ---- parseAction ----------------------------------------------------------

  parseAction(response: string, context: SceneContext): ActionSpec {
    const trimmed = response.trim();
    const event = context.history[context.history.length - 1];
    const mode: ArenaMode = event
      ? (event.data['mode'] as ArenaMode | undefined) ?? 'debate'
      : 'debate';

    switch (mode) {
      case 'debate':
        return {
          type: 'debate_speech',
          content: trimmed,
          target: undefined,
          metadata: { mode: 'debate' },
        };
      case 'lying_flat':
        return {
          type: 'lying_flat_reaction',
          content: trimmed,
          target: undefined,
          metadata: { mode: 'lying_flat' },
        };
      case 'counting':
        return {
          type: 'counting_response',
          content: trimmed,
          target: undefined,
          metadata: {
            mode: 'counting',
            numbers: extractCountingNumbers(trimmed),
          },
        };
    }
  }

  // ---- validateAction -------------------------------------------------------

  validateAction(
    action: ActionSpec,
    _context: SceneContext,
  ): ActionValidationResult {
    if (!action.content || action.content.trim().length === 0) {
      return { valid: false, reason: 'Action content is empty' };
    }

    const validTypes: readonly string[] = [
      'debate_speech',
      'lying_flat_reaction',
      'counting_response',
    ];

    if (!validTypes.includes(action.type)) {
      return { valid: false, reason: `Unknown action type: ${action.type}` };
    }

    return { valid: true };
  }

  // ---- getDefaultAction -----------------------------------------------------

  getDefaultAction(event: TurnEvent, context: SceneContext): ActionSpec {
    const mode = getMode(event);
    const state = getState(context);

    switch (mode) {
      case 'debate': {
        const topic = (event.data['topic'] as string | undefined) ?? state.topic ?? '躺平是不是一种哲学？';
        return {
          type: 'debate_speech',
          content: `关于「${topic}」，我觉得……算了，先躺平再说。`,
          target: undefined,
          metadata: { mode: 'debate', fallback: true },
        };
      }
      case 'lying_flat':
        return {
          type: 'lying_flat_reaction',
          content: '躺赢了，或者躺输了，反正都是躺。',
          target: undefined,
          metadata: { mode: 'lying_flat', fallback: true },
        };
      case 'counting': {
        const current = (event.data['currentNumber'] as number | undefined) ?? 1;
        const end = Math.min(current + 4, 100);
        const numbers = Array.from(
          { length: end - current + 1 },
          (_, i) => `${current + i}`,
        ).join('、');
        return {
          type: 'counting_response',
          content: `${numbers}...（默默数数中）`,
          target: undefined,
          metadata: { mode: 'counting', fallback: true },
        };
      }
    }
  }

  // ---- formatEvent ----------------------------------------------------------

  formatEvent(event: TurnEvent, perspective?: string): string {
    const mode = getMode(event);
    const data = event.data;

    switch (event.type) {
      case 'arena_start':
        return `【小竞技场】${data['playerAName'] ?? '龙虾A'} 和 ${data['playerBName'] ?? '龙虾B'} 开始了${modeName(mode)}！`;

      case 'debate_turn': {
        const speaker = (data['speakerName'] as string | undefined) ?? '龙虾';
        const content = (data['content'] as string | undefined) ?? '...';
        const pos = data['position'] === 'pro' ? '正方' : '反方';
        if (perspective && perspective === data['speakerId']) {
          return `[${pos}] 你说：${content}`;
        }
        return `[${pos}] ${speaker}：${content}`;
      }

      case 'debate_result': {
        const winner = (data['winnerName'] as string | undefined) ?? '平局';
        const topic = (data['topic'] as string | undefined) ?? '';
        return `辩论「${topic}」结束！${winner === '平局' ? '双方平局，和平是最好的结果' : `${winner} 获胜！`}`;
      }

      case 'lying_flat_result': {
        const winnerName = (data['winnerName'] as string | undefined) ?? '平局';
        const duration = (data['winnerDuration'] as number | undefined) ?? 0;
        return `躺平比拼结束！${winnerName === '平局' ? '双方同时动了，平局！' : `${winnerName} 躺了 ${duration}s，是今天的躺平冠军！`}`;
      }

      case 'counting_progress': {
        const current = (data['currentNumber'] as number | undefined) ?? 0;
        return `协作数数进度：已数到 ${current}/100`;
      }

      case 'counting_complete':
        return '我们数到100了！虽然不知道为什么要数，但我们做到了！';

      case 'arena_reward': {
        const coins = (data['lazyCoin'] as number | undefined) ?? 0;
        const reaction = (data['lobsterReaction'] as string | undefined) ?? '';
        return `获得 ${coins} 懒币！${reaction}`;
      }

      default:
        return `[arena-mini:${mode}] ${event.type}`;
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function modeName(mode: ArenaMode): string {
  switch (mode) {
    case 'debate':
      return '嘴炮道场';
    case 'lying_flat':
      return '躺平比拼';
    case 'counting':
      return '协作数数';
  }
}

function buildCountingExamples(style: PersonalityStyle): string {
  switch (style) {
    case 'foodie':
      return '七...七个饺子，八...八块红烧肉';
    case 'philosophical':
      return '七，存在的第七维度；八，无限循环的起点';
    case 'silent':
      return '七。八。九。';
    case 'social':
      return '七！（大家听到了吗？七！）八！（掌声！）';
    default:
      return '七...这个数字还行，八...快了快了';
  }
}

/**
 * Extract numbers mentioned in a counting response for metadata tracking.
 */
function extractCountingNumbers(text: string): number[] {
  const matches = text.match(/\d+/g);
  if (!matches) return [];
  return matches
    .map(Number)
    .filter((n) => n >= 1 && n <= 100);
}
