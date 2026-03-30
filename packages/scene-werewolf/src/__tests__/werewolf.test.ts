// @lobster-engine/scene-werewolf — WerewolfPlugin unit tests

import { describe, it, expect } from 'vitest';
import { WerewolfPlugin } from '../index.js';
import type { WerewolfState } from '../index.js';
import type { SceneContext } from '@lobster-engine/core';
import type { TurnEvent, ActionSpec } from '@lobster-engine/core';

// ---------------------------------------------------------------------------
// Helpers
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

function makeContext(
  state: WerewolfState,
  botId = 'p1',
): SceneContext {
  return {
    botId,
    sceneId: 'werewolf:room-1',
    state: state as unknown as Record<string, unknown>,
    history: [],
  };
}

function makeTurnEvent(overrides: Partial<TurnEvent> = {}): TurnEvent {
  return {
    id: 'evt-1',
    botId: 'p1',
    sceneId: 'werewolf:room-1',
    type: 'turn',
    phase: 'day_vote',
    data: {},
    timestamp: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Plugin identity
// ---------------------------------------------------------------------------

describe('WerewolfPlugin identity', () => {
  const plugin = new WerewolfPlugin();

  it('has name "scene-werewolf"', () => {
    expect(plugin.name).toBe('scene-werewolf');
  });

  it('has sceneType "werewolf"', () => {
    expect(plugin.sceneType).toBe('werewolf');
  });

  it('has version "0.0.1"', () => {
    expect(plugin.version).toBe('0.0.1');
  });
});

// ---------------------------------------------------------------------------
// buildPrompt
// ---------------------------------------------------------------------------

describe('WerewolfPlugin.buildPrompt()', () => {
  const plugin = new WerewolfPlugin();

  it('returns a system message as the first element', () => {
    const state = makeState({ phase: 'day_vote' });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'day_vote' });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].role).toBe('system');
  });

  it('always ends with a user message', () => {
    const state = makeState({ phase: 'day_vote' });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'day_vote' });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[messages.length - 1].role).toBe('user');
  });

  it('includes alive player names in user message for night_werewolf', () => {
    const state = makeState({ phase: 'night_werewolf', role: 'werewolf' });
    const ctx = makeContext(state, 'p1');
    const event = makeTurnEvent({ phase: 'night_werewolf' });
    const messages = plugin.buildPrompt(event, ctx);
    const userContent = messages[messages.length - 1].content;
    // Alice and Bob are alive; Carol is dead
    expect(userContent).toContain('Alice');
    expect(userContent).toContain('Bob');
    expect(userContent).not.toContain('Carol');
  });

  it('system prompt for night_werewolf instructs to choose a target', () => {
    const state = makeState({ phase: 'night_werewolf', role: 'werewolf' });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'night_werewolf' });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].content).toContain('werewolf');
    expect(messages[0].content.toLowerCase()).toContain('eliminate');
  });

  it('system prompt for night_seer instructs to investigate', () => {
    const state = makeState({ phase: 'night_seer', role: 'seer' });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'night_seer' });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].content.toLowerCase()).toContain('investigate');
  });

  it('system prompt for night_witch describes save/poison options', () => {
    const state = makeState({ phase: 'night_witch', role: 'witch' });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'night_witch' });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].content.toLowerCase()).toContain('save');
    expect(messages[0].content.toLowerCase()).toContain('poison');
  });

  it('system prompt for night_guard instructs to protect', () => {
    const state = makeState({ phase: 'night_guard', role: 'guard' });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'night_guard' });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].content.toLowerCase()).toContain('protect');
  });

  it('system prompt for day_speech instructs to share analysis', () => {
    const state = makeState({ phase: 'day_speech' });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'day_speech' });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].content.toLowerCase()).toContain('discussion');
  });

  it('system prompt for day_vote instructs to vote', () => {
    const state = makeState({ phase: 'day_vote' });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'day_vote' });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].content.toLowerCase()).toContain('vote');
  });

  it('system prompt for day_hunter mentions shooting', () => {
    const state = makeState({ phase: 'day_hunter', role: 'hunter' });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'day_hunter' });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].content.toLowerCase()).toContain('hunter');
  });

  it('system prompt for game_over says game is over', () => {
    const state = makeState({ phase: 'game_over' });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'game_over' });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].content.toLowerCase()).toContain('game is over');
  });

  it('includes recent history as a user message when history is non-empty', () => {
    const state = makeState({
      phase: 'day_vote',
      history: [{ round: 1, phase: 'night_werewolf', event: 'Alice was attacked.' }],
    });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'day_vote' });
    const messages = plugin.buildPrompt(event, ctx);
    const historyMsg = messages.find((m) => m.content.includes('Recent events'));
    expect(historyMsg).toBeDefined();
    expect(historyMsg!.content).toContain('Alice was attacked.');
  });

  it('omits history message when history is empty', () => {
    const state = makeState({ phase: 'day_vote', history: [] });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'day_vote' });
    const messages = plugin.buildPrompt(event, ctx);
    const historyMsg = messages.find((m) => m.content.includes('Recent events'));
    expect(historyMsg).toBeUndefined();
  });

  it('uses event phase over state phase when event.phase is provided', () => {
    // State says day_vote, event says night_seer
    const state = makeState({ phase: 'day_vote', role: 'seer' });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'night_seer' });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].content.toLowerCase()).toContain('investigate');
  });

  it('includes available witch potions in user message when both potions present', () => {
    const state = makeState({
      phase: 'night_witch',
      role: 'witch',
      witchPotions: { save: true, poison: true },
    });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'night_witch' });
    const messages = plugin.buildPrompt(event, ctx);
    const userContent = messages[messages.length - 1].content;
    expect(userContent).toContain('SAVE potion');
    expect(userContent).toContain('POISON potion');
  });

  it('does not mention save potion when it has been used', () => {
    const state = makeState({
      phase: 'night_witch',
      role: 'witch',
      witchPotions: { save: false, poison: true },
    });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'night_witch' });
    const messages = plugin.buildPrompt(event, ctx);
    const userContent = messages[messages.length - 1].content;
    expect(userContent).not.toContain('SAVE potion');
    expect(userContent).toContain('POISON potion');
  });

  it('uses custom prompt from event data in day_speech when provided', () => {
    const state = makeState({ phase: 'day_speech' });
    const ctx = makeContext(state);
    const event = makeTurnEvent({
      phase: 'day_speech',
      data: { prompt: 'Who do you suspect and why?' },
    });
    const messages = plugin.buildPrompt(event, ctx);
    const userContent = messages[messages.length - 1].content;
    expect(userContent).toContain('Who do you suspect and why?');
  });

  it('includes round number in system prompt', () => {
    const state = makeState({ phase: 'day_vote', round: 3 });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'day_vote' });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].content).toContain('Round 3');
  });
});

// ---------------------------------------------------------------------------
// parseAction
// ---------------------------------------------------------------------------

describe('WerewolfPlugin.parseAction()', () => {
  const plugin = new WerewolfPlugin();

  it('parses night_werewolf response by player name to target id', () => {
    const state = makeState({ phase: 'night_werewolf', role: 'werewolf' });
    const ctx = makeContext(state);
    const action = plugin.parseAction('Bob', ctx);
    expect(action.type).toBe('night_werewolf');
    expect(action.target).toBe('p2');
  });

  it('parses night_seer response by player name to target id', () => {
    const state = makeState({ phase: 'night_seer', role: 'seer' });
    const ctx = makeContext(state);
    const action = plugin.parseAction('Alice', ctx);
    expect(action.type).toBe('night_seer');
    expect(action.target).toBe('p1');
  });

  it('parses night_guard response by player name to target id', () => {
    const state = makeState({ phase: 'night_guard', role: 'guard' });
    const ctx = makeContext(state);
    const action = plugin.parseAction('Alice', ctx);
    expect(action.type).toBe('night_guard');
    expect(action.target).toBe('p1');
  });

  it('parses day_vote response by player name to target id', () => {
    const state = makeState({ phase: 'day_vote' });
    const ctx = makeContext(state);
    const action = plugin.parseAction('Bob', ctx);
    expect(action.type).toBe('day_vote');
    expect(action.target).toBe('p2');
  });

  it('returns undefined target when player name is not found', () => {
    const state = makeState({ phase: 'day_vote' });
    const ctx = makeContext(state);
    const action = plugin.parseAction('Zzz_unknown', ctx);
    expect(action.target).toBeUndefined();
  });

  it('returns undefined target for dead player in kill phases', () => {
    const state = makeState({ phase: 'night_werewolf', role: 'werewolf' });
    const ctx = makeContext(state);
    // Carol is dead
    const action = plugin.parseAction('Carol', ctx);
    expect(action.target).toBeUndefined();
  });

  it('parses witch "save" response as witch_save type', () => {
    const state = makeState({
      phase: 'night_witch',
      role: 'witch',
      witchPotions: { save: true, poison: true },
    });
    const ctx = makeContext(state);
    const action = plugin.parseAction('save', ctx);
    expect(action.type).toBe('witch_save');
    expect(action.target).toBeUndefined();
  });

  it('parses witch "poison Bob" response as witch_poison type with target', () => {
    const state = makeState({
      phase: 'night_witch',
      role: 'witch',
      witchPotions: { save: true, poison: true },
    });
    const ctx = makeContext(state);
    const action = plugin.parseAction('poison Bob', ctx);
    expect(action.type).toBe('witch_poison');
    expect(action.target).toBe('p2');
  });

  it('parses witch "nothing" response as witch_nothing type', () => {
    const state = makeState({ phase: 'night_witch', role: 'witch' });
    const ctx = makeContext(state);
    const action = plugin.parseAction('nothing', ctx);
    expect(action.type).toBe('witch_nothing');
    expect(action.target).toBeUndefined();
  });

  it('parses any non-save non-poison witch response as witch_nothing', () => {
    const state = makeState({ phase: 'night_witch', role: 'witch' });
    const ctx = makeContext(state);
    const action = plugin.parseAction('I do nothing tonight', ctx);
    expect(action.type).toBe('witch_nothing');
  });

  it('parses day_speech response as speech type preserving content', () => {
    const state = makeState({ phase: 'day_speech' });
    const ctx = makeContext(state);
    const action = plugin.parseAction('I suspect Bob because he was quiet.', ctx);
    expect(action.type).toBe('speech');
    expect(action.content).toBe('I suspect Bob because he was quiet.');
    expect(action.target).toBeUndefined();
  });

  it('parses day_hunter "skip" response as hunter_skip type', () => {
    const state = makeState({ phase: 'day_hunter', role: 'hunter' });
    const ctx = makeContext(state);
    const action = plugin.parseAction('skip', ctx);
    expect(action.type).toBe('hunter_skip');
    expect(action.target).toBeUndefined();
  });

  it('parses day_hunter player name as hunter_shot with target', () => {
    const state = makeState({ phase: 'day_hunter', role: 'hunter' });
    const ctx = makeContext(state);
    const action = plugin.parseAction('Bob', ctx);
    expect(action.type).toBe('hunter_shot');
    expect(action.target).toBe('p2');
  });

  it('trims leading and trailing whitespace from response', () => {
    const state = makeState({ phase: 'day_vote' });
    const ctx = makeContext(state);
    const action = plugin.parseAction('  Bob  ', ctx);
    expect(action.content).toBe('Bob');
  });

  it('returns unknown type for game_over phase', () => {
    const state = makeState({ phase: 'game_over' });
    const ctx = makeContext(state);
    const action = plugin.parseAction('anything', ctx);
    expect(action.type).toBe('unknown');
  });

  it('preserves raw content in action', () => {
    const state = makeState({ phase: 'day_vote' });
    const ctx = makeContext(state);
    const action = plugin.parseAction('Alice', ctx);
    expect(action.content).toBe('Alice');
  });
});

// ---------------------------------------------------------------------------
// validateAction
// ---------------------------------------------------------------------------

describe('WerewolfPlugin.validateAction()', () => {
  const plugin = new WerewolfPlugin();

  function makeAction(overrides: Partial<ActionSpec> = {}): ActionSpec {
    return {
      type: 'day_vote',
      content: 'vote Bob',
      target: 'p2',
      metadata: {},
      ...overrides,
    };
  }

  it('returns valid for speech action without a target', () => {
    const state = makeState({ phase: 'day_speech' });
    const ctx = makeContext(state);
    const result = plugin.validateAction(
      makeAction({ type: 'speech', target: undefined }),
      ctx,
    );
    expect(result.valid).toBe(true);
  });

  it('returns valid for witch_nothing action', () => {
    const state = makeState({ phase: 'night_witch', role: 'witch' });
    const ctx = makeContext(state);
    const result = plugin.validateAction(
      makeAction({ type: 'witch_nothing', target: undefined }),
      ctx,
    );
    expect(result.valid).toBe(true);
  });

  it('returns valid for hunter_skip action', () => {
    const state = makeState({ phase: 'day_hunter', role: 'hunter' });
    const ctx = makeContext(state);
    const result = plugin.validateAction(
      makeAction({ type: 'hunter_skip', target: undefined }),
      ctx,
    );
    expect(result.valid).toBe(true);
  });

  it('returns valid for day_vote action targeting an alive player', () => {
    const state = makeState({ phase: 'day_vote' });
    const ctx = makeContext(state);
    const result = plugin.validateAction(makeAction({ type: 'day_vote', target: 'p2' }), ctx);
    expect(result.valid).toBe(true);
  });

  it('returns invalid with reason when day_vote has no target', () => {
    const state = makeState({ phase: 'day_vote' });
    const ctx = makeContext(state);
    const result = plugin.validateAction(
      makeAction({ type: 'day_vote', target: undefined }),
      ctx,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('No target specified');
  });

  it('returns invalid when target player id does not exist', () => {
    const state = makeState({ phase: 'day_vote' });
    const ctx = makeContext(state);
    const result = plugin.validateAction(
      makeAction({ type: 'day_vote', target: 'nonexistent-id' }),
      ctx,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Target player not found');
  });

  it('returns invalid when target player is dead', () => {
    const state = makeState({ phase: 'day_vote' });
    const ctx = makeContext(state);
    // p3 = Carol who is dead
    const result = plugin.validateAction(
      makeAction({ type: 'day_vote', target: 'p3' }),
      ctx,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Target player is dead');
  });

  it('returns invalid for night_werewolf with no target', () => {
    const state = makeState({ phase: 'night_werewolf', role: 'werewolf' });
    const ctx = makeContext(state);
    const result = plugin.validateAction(
      makeAction({ type: 'night_werewolf', target: undefined }),
      ctx,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('No target specified');
  });

  it('returns invalid for witch_save when save potion has been used', () => {
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

  it('returns valid for witch_save when save potion is available', () => {
    const state = makeState({
      phase: 'night_witch',
      role: 'witch',
      witchPotions: { save: true, poison: true },
    });
    const ctx = makeContext(state);
    const result = plugin.validateAction(
      makeAction({ type: 'witch_save', target: undefined }),
      ctx,
    );
    expect(result.valid).toBe(true);
  });

  it('returns invalid for witch_poison when poison potion has been used', () => {
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

  it('returns valid for hunter_shot targeting an alive player', () => {
    const state = makeState({ phase: 'day_hunter', role: 'hunter' });
    const ctx = makeContext(state);
    const result = plugin.validateAction(
      makeAction({ type: 'hunter_shot', target: 'p2' }),
      ctx,
    );
    expect(result.valid).toBe(true);
  });

  it('returns invalid for hunter_shot targeting a dead player', () => {
    const state = makeState({ phase: 'day_hunter', role: 'hunter' });
    const ctx = makeContext(state);
    const result = plugin.validateAction(
      makeAction({ type: 'hunter_shot', target: 'p3' }),
      ctx,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Target player is dead');
  });

  it('returns valid when night_seer targets an alive player', () => {
    const state = makeState({ phase: 'night_seer', role: 'seer' });
    const ctx = makeContext(state);
    const result = plugin.validateAction(
      makeAction({ type: 'night_seer', target: 'p1' }),
      ctx,
    );
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getDefaultAction
// ---------------------------------------------------------------------------

describe('WerewolfPlugin.getDefaultAction()', () => {
  const plugin = new WerewolfPlugin();

  it('returns night_werewolf type with a target for night_werewolf phase', () => {
    const state = makeState({
      phase: 'night_werewolf',
      role: 'werewolf',
      players: [
        { id: 'p1', name: 'Alice', alive: true },
        { id: 'p2', name: 'Bob', alive: true },
      ],
    });
    const ctx = makeContext(state, 'p1');
    const event = makeTurnEvent({ phase: 'night_werewolf' });
    const action = plugin.getDefaultAction(event, ctx);
    expect(action.type).toBe('night_werewolf');
    // Bot is p1/Alice so only Bob should be targeted
    expect(action.target).toBe('p2');
  });

  it('marks fallback in metadata for night_werewolf', () => {
    const state = makeState({ phase: 'night_werewolf', role: 'werewolf' });
    const ctx = makeContext(state, 'p2');
    const event = makeTurnEvent({ phase: 'night_werewolf' });
    const action = plugin.getDefaultAction(event, ctx);
    expect(action.metadata['fallback']).toBe(true);
  });

  it('returns day_vote type with a non-self target for day_vote phase', () => {
    const state = makeState({
      phase: 'day_vote',
      players: [
        { id: 'p1', name: 'Alice', alive: true },
        { id: 'p2', name: 'Bob', alive: true },
      ],
    });
    const ctx = makeContext(state, 'p1');
    const event = makeTurnEvent({ phase: 'day_vote' });
    const action = plugin.getDefaultAction(event, ctx);
    expect(action.type).toBe('day_vote');
    expect(action.target).toBe('p2');
  });

  it('returns speech type with fallback content for day_speech phase', () => {
    const state = makeState({ phase: 'day_speech' });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'day_speech' });
    const action = plugin.getDefaultAction(event, ctx);
    expect(action.type).toBe('speech');
    expect(action.target).toBeUndefined();
    expect(action.content.length).toBeGreaterThan(0);
  });

  it('returns witch_nothing for night_witch phase', () => {
    const state = makeState({ phase: 'night_witch', role: 'witch' });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'night_witch' });
    const action = plugin.getDefaultAction(event, ctx);
    expect(action.type).toBe('witch_nothing');
    expect(action.content).toBe('nothing');
  });

  it('returns hunter_skip for day_hunter phase', () => {
    const state = makeState({ phase: 'day_hunter', role: 'hunter' });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'day_hunter' });
    const action = plugin.getDefaultAction(event, ctx);
    expect(action.type).toBe('hunter_skip');
    expect(action.content).toBe('skip');
  });

  it('uses event phase over state phase', () => {
    // State says day_vote but event says night_witch
    const state = makeState({ phase: 'day_vote', role: 'witch' });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'night_witch' });
    const action = plugin.getDefaultAction(event, ctx);
    expect(action.type).toBe('witch_nothing');
  });

  it('returns fallback with undefined target when all other players are dead', () => {
    const state = makeState({
      phase: 'night_werewolf',
      role: 'werewolf',
      players: [{ id: 'p1', name: 'Alice', alive: true }],
    });
    const ctx = makeContext(state, 'p1');
    const event = makeTurnEvent({ phase: 'night_werewolf' });
    const action = plugin.getDefaultAction(event, ctx);
    // No other alive player to target
    expect(action.target).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// formatEvent
// ---------------------------------------------------------------------------

describe('WerewolfPlugin.formatEvent()', () => {
  const plugin = new WerewolfPlugin();

  function makeEvent(type: string, data: Record<string, unknown> = {}): TurnEvent {
    return {
      id: 'evt-1',
      botId: 'p1',
      sceneId: 'werewolf:room-1',
      type,
      phase: 'night',
      data,
      timestamp: Date.now(),
    };
  }

  it('formats player_killed event with player name', () => {
    const result = plugin.formatEvent(makeEvent('player_killed', { playerName: 'Bob' }));
    expect(result).toContain('Bob');
    expect(result.toLowerCase()).toContain('eliminated');
  });

  it('formats player_killed event with fallback when playerName missing', () => {
    const result = plugin.formatEvent(makeEvent('player_killed', {}));
    expect(result).toContain('A player');
  });

  it('formats player_voted event with voter and target names', () => {
    const result = plugin.formatEvent(
      makeEvent('player_voted', { voterName: 'Alice', targetName: 'Bob' }),
    );
    expect(result).toContain('Alice');
    expect(result).toContain('Bob');
  });

  it('formats player_voted event with fallbacks when names missing', () => {
    const result = plugin.formatEvent(makeEvent('player_voted', {}));
    expect(result).toContain('Someone');
    expect(result).toContain('unknown');
  });

  it('formats vote_result event with eliminated name', () => {
    const result = plugin.formatEvent(
      makeEvent('vote_result', { eliminatedName: 'Alice' }),
    );
    expect(result).toContain('Alice');
    expect(result.toLowerCase()).toContain('voted out');
  });

  it('formats vote_result event with fallback when eliminatedName missing', () => {
    const result = plugin.formatEvent(makeEvent('vote_result', {}));
    expect(result).toContain('A player');
  });

  it('formats seer_result with investigation detail when perspective is "seer"', () => {
    const result = plugin.formatEvent(
      makeEvent('seer_result', { targetName: 'Bob', role: 'werewolf' }),
      'seer',
    );
    expect(result).toContain('Bob');
    expect(result).toContain('werewolf');
    expect(result.toLowerCase()).toContain('investigation');
  });

  it('formats seer_result as generic message when perspective is not "seer"', () => {
    const result = plugin.formatEvent(
      makeEvent('seer_result', { targetName: 'Bob', role: 'werewolf' }),
      'villager',
    );
    expect(result).not.toContain('werewolf');
    expect(result.toLowerCase()).toContain('seer');
  });

  it('formats seer_result as generic message when perspective is undefined', () => {
    const result = plugin.formatEvent(
      makeEvent('seer_result', { targetName: 'Bob', role: 'werewolf' }),
    );
    expect(result).not.toContain('werewolf');
  });

  it('formats game_end event with winner', () => {
    const result = plugin.formatEvent(
      makeEvent('game_end', { winner: 'Villagers' }),
    );
    expect(result).toContain('Villagers');
    expect(result.toLowerCase()).toContain('game over');
  });

  it('formats game_end event with fallback when winner missing', () => {
    const result = plugin.formatEvent(makeEvent('game_end', {}));
    expect(result).toContain('Unknown');
  });

  it('formats speech event with player name and content', () => {
    const result = plugin.formatEvent(
      makeEvent('speech', { playerName: 'Alice', content: 'I think Bob is a werewolf.' }),
    );
    expect(result).toContain('Alice');
    expect(result).toContain('I think Bob is a werewolf.');
  });

  it('formats speech event with fallbacks when fields missing', () => {
    const result = plugin.formatEvent(makeEvent('speech', {}));
    expect(result).toContain('A player');
    expect(result).toContain('...');
  });

  it('formats unknown event type using phase and type', () => {
    const event: TurnEvent = {
      id: 'evt-x',
      botId: 'p1',
      sceneId: 'werewolf:room-1',
      type: 'custom_event',
      phase: 'day_vote',
      data: {},
      timestamp: Date.now(),
    };
    const result = plugin.formatEvent(event);
    expect(result).toContain('day_vote');
    expect(result).toContain('custom_event');
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('WerewolfPlugin edge cases', () => {
  const plugin = new WerewolfPlugin();

  it('parseAction handles empty string response without throwing', () => {
    const state = makeState({ phase: 'day_vote' });
    const ctx = makeContext(state);
    expect(() => plugin.parseAction('', ctx)).not.toThrow();
  });

  it('parseAction on empty string for day_vote returns undefined target', () => {
    const state = makeState({ phase: 'day_vote' });
    const ctx = makeContext(state);
    const action = plugin.parseAction('', ctx);
    expect(action.type).toBe('day_vote');
    expect(action.target).toBeUndefined();
  });

  it('parseAction matches player by partial name', () => {
    const state = makeState({
      phase: 'day_vote',
      players: [{ id: 'p1', name: 'Alice Smith', alive: true }],
    });
    const ctx = makeContext(state);
    const action = plugin.parseAction('Alice', ctx);
    expect(action.target).toBe('p1');
  });

  it('validateAction returns valid for an unrecognised action type', () => {
    // Unknown action types fall through all checks and return valid
    const state = makeState({ phase: 'day_vote' });
    const ctx = makeContext(state);
    const result = plugin.validateAction(
      { type: 'unknown', content: '', target: undefined, metadata: {} },
      ctx,
    );
    expect(result.valid).toBe(true);
  });

  it('buildPrompt handles history with more than 5 entries and only shows last 5', () => {
    const history = Array.from({ length: 8 }, (_, i) => ({
      round: i + 1,
      phase: 'day_vote',
      event: `Event ${i + 1}`,
    }));
    const state = makeState({ phase: 'day_vote', history });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'day_vote' });
    const messages = plugin.buildPrompt(event, ctx);
    const historyMsg = messages.find((m) => m.content.includes('Recent events'));
    expect(historyMsg).toBeDefined();
    // Should not include early events
    expect(historyMsg!.content).not.toContain('Event 1');
    expect(historyMsg!.content).not.toContain('Event 2');
    expect(historyMsg!.content).not.toContain('Event 3');
    // Should include last 5 events
    expect(historyMsg!.content).toContain('Event 4');
    expect(historyMsg!.content).toContain('Event 8');
  });
});
