// @lobster-engine/scene-werewolf — Werewolf game scene plugin

export type {
  ArenaConnectorConfig,
  BotRegistration,
  InviteCode,
  MatchResult,
} from './connector.js';
export { LobsterArenaConnector, ArenaApiError } from './connector.js';

import type {
  ScenePlugin,
  SceneContext,
  ActionValidationResult,
  ChatMessage,
  TurnEvent,
  ActionSpec,
} from '@lobster-engine/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WerewolfRole =
  | 'werewolf'
  | 'villager'
  | 'seer'
  | 'witch'
  | 'hunter'
  | 'guard'
  | 'idiot';

export type GamePhase =
  | 'night_werewolf'
  | 'night_seer'
  | 'night_witch'
  | 'night_guard'
  | 'day_speech'
  | 'day_vote'
  | 'day_hunter'
  | 'game_over';

export interface WerewolfPlayer {
  readonly id: string;
  readonly name: string;
  readonly alive: boolean;
  readonly role?: WerewolfRole;
}

export interface WerewolfState {
  readonly role: WerewolfRole;
  readonly alive: boolean;
  readonly players: readonly WerewolfPlayer[];
  readonly phase: GamePhase;
  readonly round: number;
  readonly history: readonly { round: number; phase: string; event: string }[];
  readonly witchPotions?: { save: boolean; poison: boolean };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getState(context: SceneContext): WerewolfState {
  return context.state as unknown as WerewolfState;
}

function alivePlayers(state: WerewolfState): readonly WerewolfPlayer[] {
  return state.players.filter((p) => p.alive);
}

function alivePlayerList(state: WerewolfState): string {
  return alivePlayers(state)
    .map((p) => `${p.name} (${p.id})`)
    .join(', ');
}

function recentHistory(state: WerewolfState, count = 5): string {
  return state.history
    .slice(-count)
    .map((h) => `[Round ${h.round} ${h.phase}] ${h.event}`)
    .join('\n');
}

const PLAYER_PATTERN = /(?:player\s*)?#?(\d+)|([a-zA-Z_]\w*)/i;

function extractTarget(text: string): string | undefined {
  const match = PLAYER_PATTERN.exec(text.trim());
  if (!match) return undefined;
  return match[1] ?? match[2];
}

function findPlayer(
  target: string,
  players: readonly WerewolfPlayer[],
): WerewolfPlayer | undefined {
  const lower = target.toLowerCase();
  return (
    players.find((p) => p.id === target) ??
    players.find((p) => p.name.toLowerCase() === lower) ??
    players.find((p) => p.name.toLowerCase().includes(lower))
  );
}

function randomAlive(
  state: WerewolfState,
  excludeIds: readonly string[] = [],
): WerewolfPlayer | undefined {
  const candidates = alivePlayers(state).filter(
    (p) => !excludeIds.includes(p.id),
  );
  if (candidates.length === 0) return undefined;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export class WerewolfPlugin implements ScenePlugin {
  readonly name = 'scene-werewolf';
  readonly version = '0.0.1';
  readonly sceneType = 'werewolf';

  // ---- buildPrompt --------------------------------------------------------

  buildPrompt(event: TurnEvent, context: SceneContext): ChatMessage[] {
    const state = getState(context);
    const phase = (event.phase as GamePhase) || state.phase;
    const system = this.systemPrompt(phase, state);
    const history = recentHistory(state);

    const messages: ChatMessage[] = [
      { role: 'system', content: system },
    ];

    if (history) {
      messages.push({ role: 'user', content: `Recent events:\n${history}` });
    }

    messages.push({
      role: 'user',
      content: this.userPrompt(phase, state, event),
    });

    return messages;
  }

  private systemPrompt(phase: GamePhase, state: WerewolfState): string {
    const base = `You are playing Werewolf. Your role: ${state.role}. Round ${state.round}. You must reply briefly (1-3 sentences).`;

    switch (phase) {
      case 'night_werewolf':
        return `${base}\nAs a werewolf, choose ONE alive player to eliminate tonight. Reply with ONLY the player's name.`;
      case 'night_seer':
        return `${base}\nAs the seer, choose ONE alive player to investigate. Reply with ONLY the player's name.`;
      case 'night_witch':
        return `${base}\nAs the witch, you may save the dying player or poison someone. Reply "save", "poison <name>", or "nothing".`;
      case 'night_guard':
        return `${base}\nAs the guard, choose ONE alive player to protect tonight. Reply with ONLY the player's name.`;
      case 'day_speech':
        return `${base}\nIt's daytime discussion. Share your analysis in 1-3 sentences. Be strategic.`;
      case 'day_vote':
        return `${base}\nVote for who you think is a werewolf. Reply with ONLY the player's name.`;
      case 'day_hunter':
        return `${base}\nAs the hunter, you may take one player with you. Reply with a player's name or "skip".`;
      case 'game_over':
        return `${base}\nThe game is over.`;
    }
  }

  private userPrompt(
    phase: GamePhase,
    state: WerewolfState,
    event: TurnEvent,
  ): string {
    const alive = alivePlayerList(state);
    const prompt = (event.data['prompt'] as string) ?? '';

    switch (phase) {
      case 'night_werewolf':
        return `Alive players: ${alive}\nChoose your target:`;
      case 'night_seer':
        return `Alive players: ${alive}\nWho do you want to investigate?`;
      case 'night_witch': {
        const parts = [`Alive players: ${alive}`];
        if (state.witchPotions?.save)
          parts.push('You have the SAVE potion available.');
        if (state.witchPotions?.poison)
          parts.push('You have the POISON potion available.');
        if (prompt) parts.push(prompt);
        return parts.join('\n');
      }
      case 'night_guard':
        return `Alive players: ${alive}\nWho do you want to protect?`;
      case 'day_speech':
        return prompt || `Alive players: ${alive}\nShare your thoughts:`;
      case 'day_vote':
        return `Alive players: ${alive}\nWho do you vote to eliminate?`;
      case 'day_hunter':
        return `Alive players: ${alive}\nDo you want to shoot someone? Reply with a name or "skip".`;
      case 'game_over':
        return prompt || 'The game has ended.';
    }
  }

  // ---- parseAction ---------------------------------------------------------

  parseAction(response: string, context: SceneContext): ActionSpec {
    const state = getState(context);
    const phase = state.phase;
    const trimmed = response.trim();

    switch (phase) {
      case 'night_werewolf':
      case 'night_seer':
      case 'night_guard':
      case 'day_vote': {
        const target = extractTarget(trimmed);
        const player = target
          ? findPlayer(target, alivePlayers(state))
          : undefined;
        return {
          type: phase,
          content: trimmed,
          target: player?.id,
          metadata: {},
        };
      }

      case 'night_witch': {
        const lower = trimmed.toLowerCase();
        if (lower.includes('save')) {
          return { type: 'witch_save', content: trimmed, target: undefined, metadata: {} };
        }
        if (lower.includes('poison')) {
          const target = extractTarget(lower.replace('poison', '').trim());
          const player = target
            ? findPlayer(target, alivePlayers(state))
            : undefined;
          return {
            type: 'witch_poison',
            content: trimmed,
            target: player?.id,
            metadata: {},
          };
        }
        return { type: 'witch_nothing', content: trimmed, target: undefined, metadata: {} };
      }

      case 'day_speech':
        return { type: 'speech', content: trimmed, target: undefined, metadata: {} };

      case 'day_hunter': {
        if (trimmed.toLowerCase() === 'skip') {
          return { type: 'hunter_skip', content: 'skip', target: undefined, metadata: {} };
        }
        const target = extractTarget(trimmed);
        const player = target
          ? findPlayer(target, alivePlayers(state))
          : undefined;
        return {
          type: 'hunter_shot',
          content: trimmed,
          target: player?.id,
          metadata: {},
        };
      }

      default:
        return { type: 'unknown', content: trimmed, target: undefined, metadata: {} };
    }
  }

  // ---- validateAction ------------------------------------------------------

  validateAction(
    action: ActionSpec,
    context: SceneContext,
  ): ActionValidationResult {
    const state = getState(context);

    // Speech is always valid
    if (action.type === 'speech') {
      return { valid: true };
    }

    // "nothing" / "skip" actions are valid
    if (action.type === 'witch_nothing' || action.type === 'hunter_skip') {
      return { valid: true };
    }

    // Actions that need a target
    if (
      [
        'night_werewolf',
        'night_seer',
        'night_guard',
        'day_vote',
        'hunter_shot',
        'witch_poison',
      ].includes(action.type)
    ) {
      if (!action.target) {
        return { valid: false, reason: 'No target specified' };
      }

      const targetPlayer = state.players.find((p) => p.id === action.target);
      if (!targetPlayer) {
        return { valid: false, reason: 'Target player not found' };
      }
      if (!targetPlayer.alive) {
        return { valid: false, reason: 'Target player is dead' };
      }
    }

    // Witch potion checks
    if (action.type === 'witch_save' && !state.witchPotions?.save) {
      return { valid: false, reason: 'Save potion already used' };
    }
    if (action.type === 'witch_poison' && !state.witchPotions?.poison) {
      return { valid: false, reason: 'Poison potion already used' };
    }

    return { valid: true };
  }

  // ---- getDefaultAction ----------------------------------------------------

  getDefaultAction(event: TurnEvent, context: SceneContext): ActionSpec {
    const state = getState(context);
    const phase = (event.phase as GamePhase) || state.phase;
    const selfId = context.botId;

    switch (phase) {
      case 'night_werewolf': {
        const target = randomAlive(state, [selfId]);
        return {
          type: 'night_werewolf',
          content: target?.name ?? 'random',
          target: target?.id,
          metadata: { fallback: true },
        };
      }
      case 'day_vote': {
        const target = randomAlive(state, [selfId]);
        return {
          type: 'day_vote',
          content: target?.name ?? 'random',
          target: target?.id,
          metadata: { fallback: true },
        };
      }
      case 'day_speech':
        return {
          type: 'speech',
          content: 'I need more information before I can make a judgment.',
          target: undefined,
          metadata: { fallback: true },
        };
      case 'night_witch':
        return {
          type: 'witch_nothing',
          content: 'nothing',
          target: undefined,
          metadata: { fallback: true },
        };
      case 'day_hunter':
        return {
          type: 'hunter_skip',
          content: 'skip',
          target: undefined,
          metadata: { fallback: true },
        };
      default: {
        const target = randomAlive(state, [selfId]);
        return {
          type: phase,
          content: target?.name ?? 'pass',
          target: target?.id,
          metadata: { fallback: true },
        };
      }
    }
  }

  // ---- formatEvent ---------------------------------------------------------

  formatEvent(event: TurnEvent, perspective?: string): string {
    const data = event.data;
    const type = event.type;

    switch (type) {
      case 'player_killed':
        return `${data['playerName'] ?? 'A player'} was eliminated during the night.`;
      case 'player_voted':
        return `${data['voterName'] ?? 'Someone'} voted for ${data['targetName'] ?? 'unknown'}.`;
      case 'vote_result':
        return `${data['eliminatedName'] ?? 'A player'} was voted out.`;
      case 'seer_result':
        if (perspective === 'seer') {
          return `Investigation: ${data['targetName']} is a ${data['role']}.`;
        }
        return 'The seer has completed their investigation.';
      case 'game_end':
        return `Game over! ${data['winner'] ?? 'Unknown'} wins.`;
      case 'speech':
        return `${data['playerName'] ?? 'A player'}: ${data['content'] ?? '...'}`;
      default:
        return `[${event.phase}] ${type}`;
    }
  }
}
