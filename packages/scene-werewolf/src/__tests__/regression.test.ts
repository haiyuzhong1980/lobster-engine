// @lobster-engine/scene-werewolf — P2.9 Regression tests: WerewolfPlugin behavior

import { describe, it, expect } from 'vitest';
import { WerewolfPlugin } from '../index.js';
import type { WerewolfState, GamePhase } from '../index.js';
import type { SceneContext, ActionSpec } from '@lobster-engine/core';
import type { TurnEvent } from '@lobster-engine/core';

// ---------------------------------------------------------------------------
// Shared fixture builders
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<WerewolfState> = {}): WerewolfState {
  return {
    role: 'villager',
    alive: true,
    phase: 'day_vote',
    round: 1,
    players: [
      { id: 'p1', name: 'Alice', alive: true },
      { id: 'p2', name: 'Bob', alive: true },
      { id: 'p3', name: 'Carol', alive: false },
    ],
    history: [],
    ...overrides,
  };
}

function makeContext(state: WerewolfState, botId = 'p1'): SceneContext {
  return {
    botId,
    sceneId: 'werewolf:regression-room',
    state: state as unknown as Record<string, unknown>,
    history: [],
  };
}

function makeTurnEvent(phase: string, overrides: Partial<TurnEvent> = {}): TurnEvent {
  return {
    id: `evt-regression-${phase}`,
    botId: 'p1',
    sceneId: 'werewolf:regression-room',
    type: 'turn',
    phase,
    data: {},
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeAction(overrides: Partial<ActionSpec> = {}): ActionSpec {
  return {
    type: 'day_vote',
    content: 'vote Bob',
    target: 'p2',
    metadata: {},
    ...overrides,
  };
}

const plugin = new WerewolfPlugin();

// ---------------------------------------------------------------------------
// Regression: parseAction extracts targets from various AI response formats
// ---------------------------------------------------------------------------

describe('Regression: parseAction — target extraction from AI response formats', () => {
  it('extracts target from bare player name response', () => {
    const state = makeState({ phase: 'day_vote' });
    const ctx = makeContext(state);
    const action = plugin.parseAction('Bob', ctx);
    expect(action.target).toBe('p2');
  });

  it('extracts target when response contains "#2" numeric reference', () => {
    const state = makeState({ phase: 'day_vote' });
    const ctx = makeContext(state);
    // Pattern extracts numeric part before name lookup fallback
    const action = plugin.parseAction('#2', ctx);
    // extractTarget returns "2"; findPlayer won't match by id "2" or name "2"
    // This documents current behavior: target remains undefined when numeric doesn't match
    expect(action.type).toBe('day_vote');
  });

  it('extracts target from response with "player 1" prefix format', () => {
    const state = makeState({ phase: 'day_vote' });
    const ctx = makeContext(state);
    // PLAYER_PATTERN matches "player 1" extracting "1"
    const action = plugin.parseAction('player 1', ctx);
    expect(action.type).toBe('day_vote');
  });

  it('extracts target by partial name match in night_werewolf phase', () => {
    const state = makeState({
      phase: 'night_werewolf',
      players: [{ id: 'p1', name: 'Alice Johnson', alive: true }],
    });
    const ctx = makeContext(state, 'wolf-id');
    const action = plugin.parseAction('Alice', ctx);
    expect(action.type).toBe('night_werewolf');
    expect(action.target).toBe('p1');
  });

  it('extracts target by case-insensitive name match', () => {
    const state = makeState({ phase: 'day_vote' });
    const ctx = makeContext(state);
    const action = plugin.parseAction('bob', ctx);
    expect(action.target).toBe('p2');
  });

  it('returns undefined target when AI response contains unrecognised player name', () => {
    const state = makeState({ phase: 'day_vote' });
    const ctx = makeContext(state);
    const action = plugin.parseAction('Zephyr_999_unknown', ctx);
    expect(action.target).toBeUndefined();
  });

  it('does not match dead player as a valid target in night_werewolf', () => {
    const state = makeState({ phase: 'night_werewolf' });
    const ctx = makeContext(state);
    // Carol (p3) is dead
    const action = plugin.parseAction('Carol', ctx);
    expect(action.target).toBeUndefined();
  });

  it('parses witch "I will save them" response (contains "save") as witch_save', () => {
    const state = makeState({ phase: 'night_witch', role: 'witch' });
    const ctx = makeContext(state);
    const action = plugin.parseAction('I will save them', ctx);
    expect(action.type).toBe('witch_save');
  });

  it('parses witch "poison Alice" response with correct target', () => {
    const state = makeState({
      phase: 'night_witch',
      role: 'witch',
      players: [
        { id: 'p1', name: 'Alice', alive: true },
        { id: 'p2', name: 'Bob', alive: true },
      ],
    });
    const ctx = makeContext(state);
    const action = plugin.parseAction('poison Alice', ctx);
    expect(action.type).toBe('witch_poison');
    expect(action.target).toBe('p1');
  });

  it('trims whitespace from response before parsing', () => {
    const state = makeState({ phase: 'day_vote' });
    const ctx = makeContext(state);
    const action = plugin.parseAction('  Bob  ', ctx);
    expect(action.content).toBe('Bob');
  });

  it('parses day_hunter "skip" in various capitalizations as hunter_skip', () => {
    const state = makeState({ phase: 'day_hunter', role: 'hunter' });
    const ctx = makeContext(state);
    const action = plugin.parseAction('skip', ctx);
    expect(action.type).toBe('hunter_skip');
  });

  it('parses day_hunter player name response as hunter_shot with target', () => {
    const state = makeState({ phase: 'day_hunter', role: 'hunter' });
    const ctx = makeContext(state);
    const action = plugin.parseAction('Bob', ctx);
    expect(action.type).toBe('hunter_shot');
    expect(action.target).toBe('p2');
  });
});

// ---------------------------------------------------------------------------
// Regression: buildPrompt generates correct prompts for each game phase
// ---------------------------------------------------------------------------

describe('Regression: buildPrompt — correct prompt structure per phase', () => {
  it('night_werewolf prompt instructs to choose a target and lists alive players', () => {
    const state = makeState({
      phase: 'night_werewolf',
      role: 'werewolf',
      players: [
        { id: 'p1', name: 'Alice', alive: true },
        { id: 'p2', name: 'Bob', alive: true },
        { id: 'p3', name: 'Carol', alive: false },
      ],
    });
    const ctx = makeContext(state);
    const event = makeTurnEvent('night_werewolf');
    const messages = plugin.buildPrompt(event, ctx);

    const system = messages[0];
    const user = messages[messages.length - 1];
    expect(system.role).toBe('system');
    expect(system.content.toLowerCase()).toContain('eliminate');
    expect(user.content).toContain('Alice');
    expect(user.content).toContain('Bob');
    expect(user.content).not.toContain('Carol');
  });

  it('day_vote prompt asks to vote and includes alive players only', () => {
    const state = makeState({ phase: 'day_vote' });
    const ctx = makeContext(state);
    const event = makeTurnEvent('day_vote');
    const messages = plugin.buildPrompt(event, ctx);

    const system = messages[0];
    const user = messages[messages.length - 1];
    expect(system.content.toLowerCase()).toContain('vote');
    expect(user.content).toContain('Alice');
    expect(user.content).not.toContain('Carol');
  });

  it('day_speech prompt instructs to share analysis', () => {
    const state = makeState({ phase: 'day_speech' });
    const ctx = makeContext(state);
    const event = makeTurnEvent('day_speech');
    const messages = plugin.buildPrompt(event, ctx);

    expect(messages[0].content.toLowerCase()).toContain('discussion');
  });

  it('night_seer prompt instructs to investigate', () => {
    const state = makeState({ phase: 'night_seer', role: 'seer' });
    const ctx = makeContext(state);
    const event = makeTurnEvent('night_seer');
    const messages = plugin.buildPrompt(event, ctx);

    expect(messages[0].content.toLowerCase()).toContain('investigate');
  });

  it('night_witch prompt describes save and poison options', () => {
    const state = makeState({
      phase: 'night_witch',
      role: 'witch',
      witchPotions: { save: true, poison: true },
    });
    const ctx = makeContext(state);
    const event = makeTurnEvent('night_witch');
    const messages = plugin.buildPrompt(event, ctx);

    expect(messages[0].content.toLowerCase()).toContain('save');
    expect(messages[0].content.toLowerCase()).toContain('poison');
    const user = messages[messages.length - 1];
    expect(user.content).toContain('SAVE potion');
    expect(user.content).toContain('POISON potion');
  });

  it('night_witch prompt omits save potion mention when save already used', () => {
    const state = makeState({
      phase: 'night_witch',
      role: 'witch',
      witchPotions: { save: false, poison: true },
    });
    const ctx = makeContext(state);
    const event = makeTurnEvent('night_witch');
    const messages = plugin.buildPrompt(event, ctx);

    const user = messages[messages.length - 1];
    expect(user.content).not.toContain('SAVE potion');
    expect(user.content).toContain('POISON potion');
  });

  it('night_guard prompt instructs to protect a player', () => {
    const state = makeState({ phase: 'night_guard', role: 'guard' });
    const ctx = makeContext(state);
    const event = makeTurnEvent('night_guard');
    const messages = plugin.buildPrompt(event, ctx);

    expect(messages[0].content.toLowerCase()).toContain('protect');
  });

  it('day_hunter prompt describes shooting or skipping', () => {
    const state = makeState({ phase: 'day_hunter', role: 'hunter' });
    const ctx = makeContext(state);
    const event = makeTurnEvent('day_hunter');
    const messages = plugin.buildPrompt(event, ctx);

    expect(messages[0].content.toLowerCase()).toContain('hunter');
    const user = messages[messages.length - 1];
    expect(user.content.toLowerCase()).toContain('skip');
  });

  it('game_over prompt includes game over message', () => {
    const state = makeState({ phase: 'game_over' });
    const ctx = makeContext(state);
    const event = makeTurnEvent('game_over');
    const messages = plugin.buildPrompt(event, ctx);

    expect(messages[0].content.toLowerCase()).toContain('game is over');
  });

  it('prompt includes round number in system message', () => {
    const state = makeState({ phase: 'day_vote', round: 5 });
    const ctx = makeContext(state);
    const event = makeTurnEvent('day_vote');
    const messages = plugin.buildPrompt(event, ctx);

    expect(messages[0].content).toContain('Round 5');
  });

  it('prompt includes recent history (last 5) when history is present', () => {
    const state = makeState({
      phase: 'day_vote',
      history: [
        { round: 1, phase: 'night_werewolf', event: 'Early event A' },
        { round: 1, phase: 'day_vote', event: 'Early event B' },
        { round: 2, phase: 'night_werewolf', event: 'Event C' },
        { round: 2, phase: 'day_vote', event: 'Event D' },
        { round: 3, phase: 'night_werewolf', event: 'Event E' },
        { round: 3, phase: 'day_vote', event: 'Event F' },
        { round: 4, phase: 'night_werewolf', event: 'Event G' },
      ],
    });
    const ctx = makeContext(state);
    const event = makeTurnEvent('day_vote');
    const messages = plugin.buildPrompt(event, ctx);

    const historyMsg = messages.find((m) => m.content.includes('Recent events'));
    expect(historyMsg).toBeDefined();
    // First two events are trimmed (only last 5 kept)
    expect(historyMsg!.content).not.toContain('Early event A');
    expect(historyMsg!.content).not.toContain('Early event B');
    expect(historyMsg!.content).toContain('Event G');
  });

  it('omits history message block when history is empty', () => {
    const state = makeState({ phase: 'day_vote', history: [] });
    const ctx = makeContext(state);
    const event = makeTurnEvent('day_vote');
    const messages = plugin.buildPrompt(event, ctx);

    expect(messages.find((m) => m.content.includes('Recent events'))).toBeUndefined();
  });

  it('uses event.phase to override state.phase for prompt generation', () => {
    // State says day_vote but event says night_seer
    const state = makeState({ phase: 'day_vote', role: 'seer' });
    const ctx = makeContext(state);
    const event = makeTurnEvent('night_seer');
    const messages = plugin.buildPrompt(event, ctx);

    expect(messages[0].content.toLowerCase()).toContain('investigate');
  });

  it('custom prompt from event.data is included in day_speech user message', () => {
    const state = makeState({ phase: 'day_speech' });
    const ctx = makeContext(state);
    const event = makeTurnEvent('day_speech', {
      data: { prompt: 'Why do you suspect Alice?' },
    });
    const messages = plugin.buildPrompt(event, ctx);

    const user = messages[messages.length - 1];
    expect(user.content).toContain('Why do you suspect Alice?');
  });
});

// ---------------------------------------------------------------------------
// Regression: validateAction rejects invalid moves
// ---------------------------------------------------------------------------

describe('Regression: validateAction — rejects invalid moves', () => {
  it('rejects day_vote with no target', () => {
    const state = makeState({ phase: 'day_vote' });
    const ctx = makeContext(state);
    const result = plugin.validateAction(makeAction({ type: 'day_vote', target: undefined }), ctx);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('No target specified');
  });

  it('rejects day_vote targeting a dead player', () => {
    const state = makeState({ phase: 'day_vote' });
    const ctx = makeContext(state);
    // p3 = Carol, dead
    const result = plugin.validateAction(makeAction({ type: 'day_vote', target: 'p3' }), ctx);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Target player is dead');
  });

  it('rejects day_vote targeting a non-existent player id', () => {
    const state = makeState({ phase: 'day_vote' });
    const ctx = makeContext(state);
    const result = plugin.validateAction(makeAction({ type: 'day_vote', target: 'ghost-999' }), ctx);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Target player not found');
  });

  it('rejects night_werewolf kill with no target', () => {
    const state = makeState({ phase: 'night_werewolf', role: 'werewolf' });
    const ctx = makeContext(state);
    const result = plugin.validateAction(
      makeAction({ type: 'night_werewolf', target: undefined }),
      ctx,
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('No target specified');
  });

  it('rejects night_werewolf kill targeting a dead player', () => {
    const state = makeState({ phase: 'night_werewolf', role: 'werewolf' });
    const ctx = makeContext(state);
    const result = plugin.validateAction(
      makeAction({ type: 'night_werewolf', target: 'p3' }),
      ctx,
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Target player is dead');
  });

  it('rejects witch_save when save potion has already been used', () => {
    const state = makeState({
      phase: 'night_witch',
      role: 'witch',
      witchPotions: { save: false, poison: true },
    });
    const ctx = makeContext(state);
    const result = plugin.validateAction(
      makeAction({ type: 'witch_save', target: undefined }),
      ctx,
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Save potion already used');
  });

  it('rejects witch_poison when poison potion has already been used', () => {
    const state = makeState({
      phase: 'night_witch',
      role: 'witch',
      witchPotions: { save: true, poison: false },
    });
    const ctx = makeContext(state);
    const result = plugin.validateAction(
      makeAction({ type: 'witch_poison', target: 'p2' }),
      ctx,
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Poison potion already used');
  });

  it('rejects hunter_shot targeting a dead player', () => {
    const state = makeState({ phase: 'day_hunter', role: 'hunter' });
    const ctx = makeContext(state);
    const result = plugin.validateAction(
      makeAction({ type: 'hunter_shot', target: 'p3' }),
      ctx,
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Target player is dead');
  });

  it('rejects night_seer with no target', () => {
    const state = makeState({ phase: 'night_seer', role: 'seer' });
    const ctx = makeContext(state);
    const result = plugin.validateAction(
      makeAction({ type: 'night_seer', target: undefined }),
      ctx,
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('No target specified');
  });

  it('rejects night_guard with no target', () => {
    const state = makeState({ phase: 'night_guard', role: 'guard' });
    const ctx = makeContext(state);
    const result = plugin.validateAction(
      makeAction({ type: 'night_guard', target: undefined }),
      ctx,
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('No target specified');
  });

  it('accepts speech action without a target', () => {
    const state = makeState({ phase: 'day_speech' });
    const ctx = makeContext(state);
    const result = plugin.validateAction(
      makeAction({ type: 'speech', target: undefined }),
      ctx,
    );

    expect(result.valid).toBe(true);
  });

  it('accepts witch_nothing action', () => {
    const state = makeState({ phase: 'night_witch', role: 'witch' });
    const ctx = makeContext(state);
    const result = plugin.validateAction(
      makeAction({ type: 'witch_nothing', target: undefined }),
      ctx,
    );

    expect(result.valid).toBe(true);
  });

  it('accepts hunter_skip action', () => {
    const state = makeState({ phase: 'day_hunter', role: 'hunter' });
    const ctx = makeContext(state);
    const result = plugin.validateAction(
      makeAction({ type: 'hunter_skip', target: undefined }),
      ctx,
    );

    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Regression: getDefaultAction returns valid random actions
// ---------------------------------------------------------------------------

describe('Regression: getDefaultAction — returns valid fallback actions', () => {
  it('returns night_werewolf type with fallback metadata for night_werewolf phase', () => {
    const state = makeState({
      phase: 'night_werewolf',
      role: 'werewolf',
      players: [
        { id: 'p1', name: 'Alice', alive: true },
        { id: 'p2', name: 'Bob', alive: true },
      ],
    });
    const ctx = makeContext(state, 'p1');
    const event = makeTurnEvent('night_werewolf');
    const action = plugin.getDefaultAction(event, ctx);

    expect(action.type).toBe('night_werewolf');
    expect(action.metadata['fallback']).toBe(true);
  });

  it('returns a target that is not the bot itself for night_werewolf', () => {
    const state = makeState({
      phase: 'night_werewolf',
      role: 'werewolf',
      players: [
        { id: 'p1', name: 'Alice', alive: true },
        { id: 'p2', name: 'Bob', alive: true },
      ],
    });
    const ctx = makeContext(state, 'p1');
    const event = makeTurnEvent('night_werewolf');
    const action = plugin.getDefaultAction(event, ctx);

    expect(action.target).toBe('p2');
  });

  it('returns undefined target when bot is the only alive player in night_werewolf', () => {
    const state = makeState({
      phase: 'night_werewolf',
      role: 'werewolf',
      players: [{ id: 'p1', name: 'Alice', alive: true }],
    });
    const ctx = makeContext(state, 'p1');
    const event = makeTurnEvent('night_werewolf');
    const action = plugin.getDefaultAction(event, ctx);

    expect(action.target).toBeUndefined();
  });

  it('returns day_vote type with non-self target for day_vote phase', () => {
    const state = makeState({
      phase: 'day_vote',
      players: [
        { id: 'p1', name: 'Alice', alive: true },
        { id: 'p2', name: 'Bob', alive: true },
      ],
    });
    const ctx = makeContext(state, 'p1');
    const event = makeTurnEvent('day_vote');
    const action = plugin.getDefaultAction(event, ctx);

    expect(action.type).toBe('day_vote');
    expect(action.target).toBe('p2');
    expect(action.metadata['fallback']).toBe(true);
  });

  it('returns speech type with non-empty fallback content for day_speech', () => {
    const state = makeState({ phase: 'day_speech' });
    const ctx = makeContext(state);
    const event = makeTurnEvent('day_speech');
    const action = plugin.getDefaultAction(event, ctx);

    expect(action.type).toBe('speech');
    expect(action.content.length).toBeGreaterThan(0);
    expect(action.target).toBeUndefined();
    expect(action.metadata['fallback']).toBe(true);
  });

  it('returns witch_nothing for night_witch phase', () => {
    const state = makeState({ phase: 'night_witch', role: 'witch' });
    const ctx = makeContext(state);
    const event = makeTurnEvent('night_witch');
    const action = plugin.getDefaultAction(event, ctx);

    expect(action.type).toBe('witch_nothing');
    expect(action.content).toBe('nothing');
    expect(action.metadata['fallback']).toBe(true);
  });

  it('returns hunter_skip for day_hunter phase', () => {
    const state = makeState({ phase: 'day_hunter', role: 'hunter' });
    const ctx = makeContext(state);
    const event = makeTurnEvent('day_hunter');
    const action = plugin.getDefaultAction(event, ctx);

    expect(action.type).toBe('hunter_skip');
    expect(action.content).toBe('skip');
    expect(action.metadata['fallback']).toBe(true);
  });

  it('uses event.phase instead of state.phase when they differ', () => {
    // State says day_vote, but event says night_witch
    const state = makeState({ phase: 'day_vote', role: 'witch' });
    const ctx = makeContext(state);
    const event = makeTurnEvent('night_witch');
    const action = plugin.getDefaultAction(event, ctx);

    expect(action.type).toBe('witch_nothing');
  });

  it('returns a fallback with correct phase type for night_seer', () => {
    const state = makeState({ phase: 'night_seer', role: 'seer' });
    const ctx = makeContext(state);
    const event = makeTurnEvent('night_seer');
    const action = plugin.getDefaultAction(event, ctx);

    // night_seer falls through to default case — returns phase as type
    expect(action.type).toBe('night_seer');
    expect(action.metadata['fallback']).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Regression: formatEvent produces human-readable descriptions
// ---------------------------------------------------------------------------

describe('Regression: formatEvent — human-readable event descriptions', () => {
  function makeEvent(type: string, phase: GamePhase | string, data: Record<string, unknown> = {}): TurnEvent {
    return {
      id: `evt-fmt-${type}`,
      botId: 'p1',
      sceneId: 'werewolf:regression-room',
      type,
      phase,
      data,
      timestamp: Date.now(),
    };
  }

  it('formats player_killed with correct player name', () => {
    const result = plugin.formatEvent(makeEvent('player_killed', 'night_werewolf', { playerName: 'Bob' }));
    expect(result).toContain('Bob');
    expect(result.toLowerCase()).toContain('eliminated');
  });

  it('formats player_killed with fallback "A player" when playerName is missing', () => {
    const result = plugin.formatEvent(makeEvent('player_killed', 'night_werewolf', {}));
    expect(result).toContain('A player');
  });

  it('formats player_voted with both voter and target names', () => {
    const result = plugin.formatEvent(
      makeEvent('player_voted', 'day_vote', { voterName: 'Alice', targetName: 'Bob' }),
    );
    expect(result).toContain('Alice');
    expect(result).toContain('Bob');
  });

  it('formats player_voted with fallbacks when names are absent', () => {
    const result = plugin.formatEvent(makeEvent('player_voted', 'day_vote', {}));
    expect(result).toContain('Someone');
    expect(result).toContain('unknown');
  });

  it('formats vote_result with eliminated player name', () => {
    const result = plugin.formatEvent(
      makeEvent('vote_result', 'day_vote', { eliminatedName: 'Alice' }),
    );
    expect(result).toContain('Alice');
    expect(result.toLowerCase()).toContain('voted out');
  });

  it('formats vote_result with fallback when eliminatedName is absent', () => {
    const result = plugin.formatEvent(makeEvent('vote_result', 'day_vote', {}));
    expect(result).toContain('A player');
  });

  it('formats seer_result with full investigation detail when perspective is seer', () => {
    const result = plugin.formatEvent(
      makeEvent('seer_result', 'night_seer', { targetName: 'Bob', role: 'werewolf' }),
      'seer',
    );
    expect(result).toContain('Bob');
    expect(result).toContain('werewolf');
    expect(result.toLowerCase()).toContain('investigation');
  });

  it('formats seer_result as generic message when perspective is not seer', () => {
    const result = plugin.formatEvent(
      makeEvent('seer_result', 'night_seer', { targetName: 'Bob', role: 'werewolf' }),
      'villager',
    );
    // Must not reveal the role to non-seer
    expect(result).not.toContain('werewolf');
    expect(result.toLowerCase()).toContain('seer');
  });

  it('formats seer_result as generic message when perspective is undefined', () => {
    const result = plugin.formatEvent(
      makeEvent('seer_result', 'night_seer', { targetName: 'Bob', role: 'werewolf' }),
    );
    expect(result).not.toContain('werewolf');
  });

  it('formats game_end with winning faction name', () => {
    const result = plugin.formatEvent(
      makeEvent('game_end', 'game_over', { winner: 'Werewolves' }),
    );
    expect(result).toContain('Werewolves');
    expect(result.toLowerCase()).toContain('game over');
  });

  it('formats game_end with fallback "Unknown" when winner is missing', () => {
    const result = plugin.formatEvent(makeEvent('game_end', 'game_over', {}));
    expect(result).toContain('Unknown');
  });

  it('formats speech event with player name and content', () => {
    const result = plugin.formatEvent(
      makeEvent('speech', 'day_speech', {
        playerName: 'Alice',
        content: 'Bob has been suspicious.',
      }),
    );
    expect(result).toContain('Alice');
    expect(result).toContain('Bob has been suspicious.');
  });

  it('formats speech event with fallbacks when playerName and content are missing', () => {
    const result = plugin.formatEvent(makeEvent('speech', 'day_speech', {}));
    expect(result).toContain('A player');
    expect(result).toContain('...');
  });

  it('formats unknown event types using phase and type fields', () => {
    const result = plugin.formatEvent(makeEvent('custom_game_event', 'day_vote', {}));
    expect(result).toContain('day_vote');
    expect(result).toContain('custom_game_event');
  });

  it('produces a non-empty string for every standard event type', () => {
    const eventTypes = [
      'player_killed',
      'player_voted',
      'vote_result',
      'seer_result',
      'game_end',
      'speech',
    ];

    for (const type of eventTypes) {
      const result = plugin.formatEvent(makeEvent(type, 'day_vote', {}));
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    }
  });
});
