// @lobster-engine/scene-codenames — CodenamesPlugin unit tests

import { describe, it, expect } from 'vitest';
import { CodenamesPlugin } from '../index.js';
import type { CodenamesState, BoardCard } from '../index.js';
import type { SceneContext } from '@lobster-engine/core';
import type { TurnEvent, ActionSpec } from '@lobster-engine/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBoard(overrides: Partial<BoardCard>[] = []): BoardCard[] {
  const defaultWords = [
    'APPLE', 'RIVER', 'CLOUD', 'STONE', 'EAGLE',
    'TIGER', 'OCEAN', 'FLAME', 'CHESS', 'SWORD',
    'PIANO', 'GHOST', 'STORM', 'BRIDGE', 'CROWN',
    'SHARK', 'GRAPE', 'TOWER', 'SPARK', 'NORTH',
    'LEMON', 'CRANE', 'ARROW', 'CABIN', 'FROST',
  ];
  const defaultColors: BoardCard['color'][] = [
    'red', 'red', 'red', 'red', 'red',       // 5 red (indices 0-4 for easy targeting)
    'blue', 'blue', 'blue', 'blue', 'blue',   // 5 blue
    'blue', 'blue', 'blue', 'blue', 'blue',   // (blue total = 9 to mirror standard rules)
    'neutral', 'neutral', 'neutral', 'neutral', 'neutral',
    'neutral', 'neutral', 'neutral', 'neutral', 'assassin',
  ];
  const board: BoardCard[] = defaultWords.map((word, i) => ({
    word,
    color: defaultColors[i],
    revealed: false,
    ...overrides[i],
  }));
  return board;
}

function makeState(overrides: Partial<CodenamesState> = {}): CodenamesState {
  const board = overrides.board ?? makeBoard();
  return {
    board,
    phase: 'spymaster_clue',
    currentTeam: 'red',
    role: 'spymaster',
    currentClue: undefined,
    guessesRemaining: 0,
    redScore: 0,
    blueScore: 0,
    redTotal: 5,
    blueTotal: 9,
    winner: undefined,
    ...overrides,
  };
}

function makeContext(state: CodenamesState, botId = 'bot-1'): SceneContext {
  return {
    botId,
    sceneId: 'codenames:room-1',
    state: state as unknown as Record<string, unknown>,
    history: [],
  };
}

function makeTurnEvent(overrides: Partial<TurnEvent> = {}): TurnEvent {
  return {
    id: 'evt-1',
    botId: 'bot-1',
    sceneId: 'codenames:room-1',
    type: 'turn',
    phase: 'spymaster_clue',
    data: {},
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeAction(overrides: Partial<ActionSpec> = {}): ActionSpec {
  return {
    type: 'clue',
    content: 'OCEAN 2',
    target: undefined,
    metadata: { clueWord: 'OCEAN', clueCount: 2 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Plugin identity
// ---------------------------------------------------------------------------

describe('CodenamesPlugin identity', () => {
  const plugin = new CodenamesPlugin();

  it('has name "codenames"', () => {
    expect(plugin.name).toBe('codenames');
  });

  it('has sceneType "codenames"', () => {
    expect(plugin.sceneType).toBe('codenames');
  });

  it('has version "0.0.1"', () => {
    expect(plugin.version).toBe('0.0.1');
  });
});

// ---------------------------------------------------------------------------
// buildPrompt
// ---------------------------------------------------------------------------

describe('CodenamesPlugin.buildPrompt()', () => {
  const plugin = new CodenamesPlugin();

  it('returns a system message as the first element', () => {
    const state = makeState({ phase: 'spymaster_clue' });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'spymaster_clue' });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].role).toBe('system');
  });

  it('always ends with a user message', () => {
    const state = makeState({ phase: 'spymaster_clue' });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'spymaster_clue' });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[messages.length - 1].role).toBe('user');
  });

  it('includes a board summary user message', () => {
    const state = makeState({ phase: 'spymaster_clue' });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'spymaster_clue' });
    const messages = plugin.buildPrompt(event, ctx);
    const boardMsg = messages.find((m) => m.content.includes('Score'));
    expect(boardMsg).toBeDefined();
  });

  it('system prompt for spymaster_clue instructs to give a one-word clue', () => {
    const state = makeState({ phase: 'spymaster_clue', role: 'spymaster' });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'spymaster_clue' });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].content.toLowerCase()).toContain('clue');
    expect(messages[0].content).toContain('WORD NUMBER');
  });

  it('system prompt for spymaster_clue warns that clue word must not be on board', () => {
    const state = makeState({ phase: 'spymaster_clue', role: 'spymaster' });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'spymaster_clue' });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].content.toLowerCase()).toContain('not');
    expect(messages[0].content.toLowerCase()).toContain('board');
  });

  it('system prompt for team_guess includes the active clue', () => {
    const state = makeState({
      phase: 'team_guess',
      role: 'guesser',
      currentClue: { word: 'OCEAN', count: 2 },
      guessesRemaining: 2,
    });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'team_guess' });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].content).toContain('OCEAN');
    expect(messages[0].content).toContain('2');
  });

  it('system prompt for team_guess mentions PASS option', () => {
    const state = makeState({
      phase: 'team_guess',
      role: 'guesser',
      currentClue: { word: 'FLAME', count: 1 },
      guessesRemaining: 1,
    });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'team_guess' });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].content).toContain('PASS');
  });

  it('system prompt for game_over states the game is over', () => {
    const state = makeState({ phase: 'game_over', winner: 'red' });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'game_over' });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].content.toLowerCase()).toContain('game is over');
  });

  it('system prompt for game_over names the winning team', () => {
    const state = makeState({ phase: 'game_over', winner: 'blue' });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'game_over' });
    const messages = plugin.buildPrompt(event, ctx);
    expect(messages[0].content).toContain('BLUE');
  });

  it('user prompt for spymaster_clue lists unrevealed team words', () => {
    const state = makeState({ phase: 'spymaster_clue', currentTeam: 'red', role: 'spymaster' });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'spymaster_clue' });
    const messages = plugin.buildPrompt(event, ctx);
    const lastMsg = messages[messages.length - 1].content;
    // First 5 cards are red (APPLE, RIVER, CLOUD, STONE, EAGLE)
    expect(lastMsg).toContain('APPLE');
    expect(lastMsg).toContain('RIVER');
  });

  it('user prompt for team_guess includes guesses remaining', () => {
    const state = makeState({
      phase: 'team_guess',
      role: 'guesser',
      currentClue: { word: 'STORM', count: 3 },
      guessesRemaining: 3,
    });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'team_guess' });
    const messages = plugin.buildPrompt(event, ctx);
    const lastMsg = messages[messages.length - 1].content;
    expect(lastMsg).toContain('3');
  });

  it('user prompt for reveal shows the revealed word and color', () => {
    const state = makeState({ phase: 'reveal' });
    const ctx = makeContext(state);
    const event = makeTurnEvent({
      phase: 'reveal',
      data: { word: 'GHOST', color: 'neutral' },
    });
    const messages = plugin.buildPrompt(event, ctx);
    const lastMsg = messages[messages.length - 1].content;
    expect(lastMsg).toContain('GHOST');
    expect(lastMsg).toContain('NEUTRAL');
  });

  it('uses event phase over state phase', () => {
    const event = makeTurnEvent({
      phase: 'team_guess',
      data: {},
    });
    // Set currentClue on state so the system prompt can reference it
    const stateWithClue = makeState({
      phase: 'spymaster_clue',
      role: 'guesser',
      currentClue: { word: 'RIVER', count: 1 },
      guessesRemaining: 1,
    });
    const ctxWithClue = makeContext(stateWithClue);
    const messages = plugin.buildPrompt(event, ctxWithClue);
    // Should produce team_guess system prompt (mentions PASS)
    expect(messages[0].content).toContain('PASS');
  });

  it('board message shows revealed words in brackets', () => {
    const board = makeBoard();
    // Reveal the first card
    const boardWithRevealed: BoardCard[] = board.map((c, i) =>
      i === 0 ? { ...c, revealed: true } : c,
    );
    const state = makeState({ phase: 'spymaster_clue', board: boardWithRevealed });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'spymaster_clue' });
    const messages = plugin.buildPrompt(event, ctx);
    const boardMsg = messages.find((m) => m.content.includes('[APPLE]'));
    expect(boardMsg).toBeDefined();
  });

  it('board message includes current score', () => {
    const state = makeState({ redScore: 3, blueScore: 2, redTotal: 5, blueTotal: 9 });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'spymaster_clue' });
    const messages = plugin.buildPrompt(event, ctx);
    const boardMsg = messages.find((m) => m.content.includes('Score'));
    expect(boardMsg?.content).toContain('3/5');
    expect(boardMsg?.content).toContain('2/9');
  });

  it('custom prompt from event data is included in user message', () => {
    const state = makeState({ phase: 'spymaster_clue' });
    const ctx = makeContext(state);
    const event = makeTurnEvent({
      phase: 'spymaster_clue',
      data: { prompt: 'Think carefully about your clue.' },
    });
    const messages = plugin.buildPrompt(event, ctx);
    const lastMsg = messages[messages.length - 1].content;
    expect(lastMsg).toContain('Think carefully about your clue.');
  });
});

// ---------------------------------------------------------------------------
// parseAction
// ---------------------------------------------------------------------------

describe('CodenamesPlugin.parseAction()', () => {
  const plugin = new CodenamesPlugin();

  it('parses "OCEAN 2" as a clue with correct word and count', () => {
    const state = makeState({ phase: 'spymaster_clue' });
    const ctx = makeContext(state);
    const action = plugin.parseAction('OCEAN 2', ctx);
    expect(action.type).toBe('clue');
    expect(action.metadata['clueWord']).toBe('OCEAN');
    expect(action.metadata['clueCount']).toBe(2);
  });

  it('normalises clue word to uppercase', () => {
    const state = makeState({ phase: 'spymaster_clue' });
    const ctx = makeContext(state);
    const action = plugin.parseAction('ocean 2', ctx);
    expect(action.metadata['clueWord']).toBe('OCEAN');
  });

  it('parses clue with comma separator "FLAME, 3"', () => {
    const state = makeState({ phase: 'spymaster_clue' });
    const ctx = makeContext(state);
    const action = plugin.parseAction('FLAME, 3', ctx);
    expect(action.type).toBe('clue');
    expect(action.metadata['clueWord']).toBe('FLAME');
    expect(action.metadata['clueCount']).toBe(3);
  });

  it('sets parseError flag when clue cannot be parsed', () => {
    const state = makeState({ phase: 'spymaster_clue' });
    const ctx = makeContext(state);
    const action = plugin.parseAction('just a random sentence', ctx);
    expect(action.type).toBe('clue');
    expect(action.metadata['parseError']).toBe(true);
  });

  it('parses a valid board word as a guess', () => {
    const state = makeState({
      phase: 'team_guess',
      role: 'guesser',
      currentClue: { word: 'FRUIT', count: 1 },
      guessesRemaining: 1,
    });
    const ctx = makeContext(state);
    // "APPLE" is on the board
    const action = plugin.parseAction('APPLE', ctx);
    expect(action.type).toBe('guess');
    expect(action.target).toBe('APPLE');
  });

  it('parses guess word case-insensitively', () => {
    const state = makeState({
      phase: 'team_guess',
      role: 'guesser',
      currentClue: { word: 'FRUIT', count: 1 },
      guessesRemaining: 1,
    });
    const ctx = makeContext(state);
    const action = plugin.parseAction('apple', ctx);
    expect(action.type).toBe('guess');
    expect(action.target).toBe('APPLE');
  });

  it('returns undefined target when guessed word is not on the board', () => {
    const state = makeState({
      phase: 'team_guess',
      role: 'guesser',
      currentClue: { word: 'X', count: 1 },
      guessesRemaining: 1,
    });
    const ctx = makeContext(state);
    const action = plugin.parseAction('NOTAWORD', ctx);
    expect(action.type).toBe('guess');
    expect(action.target).toBeUndefined();
  });

  it('parses "PASS" as a pass action', () => {
    const state = makeState({
      phase: 'team_guess',
      role: 'guesser',
      currentClue: { word: 'X', count: 1 },
      guessesRemaining: 1,
    });
    const ctx = makeContext(state);
    const action = plugin.parseAction('PASS', ctx);
    expect(action.type).toBe('pass');
    expect(action.target).toBeUndefined();
  });

  it('parses "pass" (lowercase) as a pass action', () => {
    const state = makeState({
      phase: 'team_guess',
      role: 'guesser',
      currentClue: { word: 'X', count: 1 },
      guessesRemaining: 1,
    });
    const ctx = makeContext(state);
    const action = plugin.parseAction('pass', ctx);
    expect(action.type).toBe('pass');
  });

  it('preserves raw content in action', () => {
    const state = makeState({ phase: 'spymaster_clue' });
    const ctx = makeContext(state);
    const action = plugin.parseAction('FLAME 2', ctx);
    expect(action.content).toBe('FLAME 2');
  });

  it('trims whitespace from response', () => {
    const state = makeState({ phase: 'spymaster_clue' });
    const ctx = makeContext(state);
    const action = plugin.parseAction('  FLAME 2  ', ctx);
    expect(action.content).toBe('FLAME 2');
  });

  it('returns phase type for reveal phase', () => {
    const state = makeState({ phase: 'reveal' });
    const ctx = makeContext(state);
    const action = plugin.parseAction('ok', ctx);
    expect(action.type).toBe('reveal');
  });

  it('returns phase type for game_over phase', () => {
    const state = makeState({ phase: 'game_over' });
    const ctx = makeContext(state);
    const action = plugin.parseAction('gg', ctx);
    expect(action.type).toBe('game_over');
  });

  it('returns unknown type for an unrecognised phase', () => {
    const state = makeState({ phase: 'reveal' });
    // Forcibly supply a bogus phase via context state cast
    const bogusState = { ...state, phase: 'totally_unknown' } as unknown as CodenamesState;
    const ctx = makeContext(bogusState);
    const action = plugin.parseAction('anything', ctx);
    expect(action.type).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// validateAction
// ---------------------------------------------------------------------------

describe('CodenamesPlugin.validateAction()', () => {
  const plugin = new CodenamesPlugin();

  it('returns valid for a well-formed clue not on the board', () => {
    const state = makeState({ phase: 'spymaster_clue' });
    const ctx = makeContext(state);
    const action = makeAction({
      type: 'clue',
      metadata: { clueWord: 'SATELLITE', clueCount: 2 },
    });
    const result = plugin.validateAction(action, ctx);
    expect(result.valid).toBe(true);
  });

  it('returns invalid when clue has parseError flag', () => {
    const state = makeState({ phase: 'spymaster_clue' });
    const ctx = makeContext(state);
    const action = makeAction({
      type: 'clue',
      metadata: { parseError: true },
    });
    const result = plugin.validateAction(action, ctx);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('parsed');
  });

  it('returns invalid when clue word appears on the board', () => {
    const state = makeState({ phase: 'spymaster_clue' });
    const ctx = makeContext(state);
    // "APPLE" is on the board
    const action = makeAction({
      type: 'clue',
      metadata: { clueWord: 'APPLE', clueCount: 1 },
    });
    const result = plugin.validateAction(action, ctx);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('APPLE');
  });

  it('returns invalid when clue count is negative', () => {
    const state = makeState({ phase: 'spymaster_clue' });
    const ctx = makeContext(state);
    const action = makeAction({
      type: 'clue',
      metadata: { clueWord: 'SATELLITE', clueCount: -1 },
    });
    const result = plugin.validateAction(action, ctx);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('non-negative');
  });

  it('returns invalid when clue word is missing', () => {
    const state = makeState({ phase: 'spymaster_clue' });
    const ctx = makeContext(state);
    const action = makeAction({
      type: 'clue',
      metadata: { clueCount: 2 },
    });
    const result = plugin.validateAction(action, ctx);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('missing');
  });

  it('returns valid for a zero-count clue (unlimited guesses convention)', () => {
    const state = makeState({ phase: 'spymaster_clue' });
    const ctx = makeContext(state);
    const action = makeAction({
      type: 'clue',
      metadata: { clueWord: 'UNIVERSE', clueCount: 0 },
    });
    const result = plugin.validateAction(action, ctx);
    expect(result.valid).toBe(true);
  });

  it('returns valid for a guess of an unrevealed board word', () => {
    const state = makeState({
      phase: 'team_guess',
      guessesRemaining: 2,
    });
    const ctx = makeContext(state);
    const action = makeAction({
      type: 'guess',
      content: 'APPLE',
      target: 'APPLE',
      metadata: { guessWord: 'APPLE' },
    });
    const result = plugin.validateAction(action, ctx);
    expect(result.valid).toBe(true);
  });

  it('returns invalid when guessed word is not on the board', () => {
    const state = makeState({ phase: 'team_guess', guessesRemaining: 2 });
    const ctx = makeContext(state);
    const action = makeAction({
      type: 'guess',
      content: 'NOTAWORD',
      target: undefined,
      metadata: { guessWord: 'NOTAWORD' },
    });
    const result = plugin.validateAction(action, ctx);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('not on the board');
  });

  it('returns invalid when guessed word has already been revealed', () => {
    const board = makeBoard();
    const boardWithRevealed: BoardCard[] = board.map((c, i) =>
      i === 0 ? { ...c, revealed: true } : c,
    );
    const state = makeState({ phase: 'team_guess', board: boardWithRevealed, guessesRemaining: 2 });
    const ctx = makeContext(state);
    const action = makeAction({
      type: 'guess',
      content: 'APPLE',
      target: 'APPLE',
      metadata: { guessWord: 'APPLE' },
    });
    const result = plugin.validateAction(action, ctx);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('already been revealed');
  });

  it('returns invalid when guessesRemaining is 0', () => {
    const state = makeState({ phase: 'team_guess', guessesRemaining: 0 });
    const ctx = makeContext(state);
    const action = makeAction({
      type: 'guess',
      content: 'RIVER',
      target: 'RIVER',
      metadata: { guessWord: 'RIVER' },
    });
    const result = plugin.validateAction(action, ctx);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('No guesses remaining');
  });

  it('returns valid for a pass action', () => {
    const state = makeState({ phase: 'team_guess', guessesRemaining: 2 });
    const ctx = makeContext(state);
    const action = makeAction({ type: 'pass', content: 'PASS', target: undefined, metadata: {} });
    const result = plugin.validateAction(action, ctx);
    expect(result.valid).toBe(true);
  });

  it('returns valid for a reveal action', () => {
    const state = makeState({ phase: 'reveal' });
    const ctx = makeContext(state);
    const action = makeAction({ type: 'reveal', content: '', target: undefined, metadata: {} });
    const result = plugin.validateAction(action, ctx);
    expect(result.valid).toBe(true);
  });

  it('returns valid for a game_over action', () => {
    const state = makeState({ phase: 'game_over' });
    const ctx = makeContext(state);
    const action = makeAction({ type: 'game_over', content: '', target: undefined, metadata: {} });
    const result = plugin.validateAction(action, ctx);
    expect(result.valid).toBe(true);
  });

  it('returns invalid for an unknown action type', () => {
    const state = makeState({ phase: 'spymaster_clue' });
    const ctx = makeContext(state);
    const action = makeAction({ type: 'unknown', content: '', target: undefined, metadata: {} });
    const result = plugin.validateAction(action, ctx);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Unknown action type');
  });
});

// ---------------------------------------------------------------------------
// getDefaultAction
// ---------------------------------------------------------------------------

describe('CodenamesPlugin.getDefaultAction()', () => {
  const plugin = new CodenamesPlugin();

  it('returns a clue action for spymaster_clue phase', () => {
    const state = makeState({ phase: 'spymaster_clue' });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'spymaster_clue' });
    const action = plugin.getDefaultAction(event, ctx);
    expect(action.type).toBe('clue');
  });

  it('marks fallback in metadata for spymaster_clue', () => {
    const state = makeState({ phase: 'spymaster_clue' });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'spymaster_clue' });
    const action = plugin.getDefaultAction(event, ctx);
    expect(action.metadata['fallback']).toBe(true);
  });

  it('returns a guess targeting a red team word during team_guess for red team', () => {
    const state = makeState({
      phase: 'team_guess',
      currentTeam: 'red',
      role: 'guesser',
      currentClue: { word: 'X', count: 1 },
      guessesRemaining: 1,
    });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'team_guess' });
    const action = plugin.getDefaultAction(event, ctx);
    // The action target should be one of the red unrevealed words
    const redWords = ['APPLE', 'RIVER', 'CLOUD', 'STONE', 'EAGLE'];
    if (action.type === 'guess') {
      expect(redWords).toContain(action.target);
    } else {
      // pass is also acceptable if no red words remain
      expect(action.type).toBe('pass');
    }
  });

  it('returns pass when no team words remain on the board', () => {
    // Make all red cards revealed
    const board = makeBoard();
    const boardAllRedRevealed: BoardCard[] = board.map((c) =>
      c.color === 'red' ? { ...c, revealed: true } : c,
    );
    const state = makeState({
      phase: 'team_guess',
      currentTeam: 'red',
      board: boardAllRedRevealed,
      guessesRemaining: 2,
    });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'team_guess' });
    const action = plugin.getDefaultAction(event, ctx);
    expect(action.type).toBe('pass');
  });

  it('returns reveal action for reveal phase', () => {
    const state = makeState({ phase: 'reveal' });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'reveal' });
    const action = plugin.getDefaultAction(event, ctx);
    expect(action.type).toBe('reveal');
  });

  it('returns game_over action for game_over phase', () => {
    const state = makeState({ phase: 'game_over', winner: 'blue' });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'game_over' });
    const action = plugin.getDefaultAction(event, ctx);
    expect(action.type).toBe('game_over');
  });

  it('uses event phase over state phase', () => {
    const state = makeState({
      phase: 'spymaster_clue',
      currentTeam: 'blue',
      guessesRemaining: 1,
      currentClue: { word: 'X', count: 1 },
    });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'team_guess' });
    const action = plugin.getDefaultAction(event, ctx);
    // Should behave as team_guess, not spymaster_clue
    expect(['guess', 'pass']).toContain(action.type);
  });

  it('returns pass for an unknown phase', () => {
    const state = makeState({ phase: 'reveal' });
    const bogusState = { ...state, phase: 'impossible_phase' } as unknown as CodenamesState;
    const ctx = makeContext(bogusState);
    const event = makeTurnEvent({ phase: 'impossible_phase' });
    const action = plugin.getDefaultAction(event, ctx);
    expect(action.type).toBe('pass');
  });
});

// ---------------------------------------------------------------------------
// formatEvent
// ---------------------------------------------------------------------------

describe('CodenamesPlugin.formatEvent()', () => {
  const plugin = new CodenamesPlugin();

  function makeFormatEvent(type: string, data: Record<string, unknown> = {}): TurnEvent {
    return {
      id: 'evt-1',
      botId: 'bot-1',
      sceneId: 'codenames:room-1',
      type,
      phase: 'team_guess',
      data,
      timestamp: Date.now(),
    };
  }

  it('formats clue_given event with team, word and count', () => {
    const result = plugin.formatEvent(
      makeFormatEvent('clue_given', { team: 'red', clueWord: 'OCEAN', clueCount: 2 }),
    );
    expect(result).toContain('RED');
    expect(result).toContain('OCEAN');
    expect(result).toContain('2');
  });

  it('formats clue_given with fallbacks when data is missing', () => {
    const result = plugin.formatEvent(makeFormatEvent('clue_given', {}));
    expect(result).toContain('UNKNOWN');
    expect(result).toContain('?');
  });

  it('formats word_guessed event with correct result', () => {
    const result = plugin.formatEvent(
      makeFormatEvent('word_guessed', {
        guesserName: 'Alice',
        word: 'APPLE',
        color: 'red',
        correct: true,
      }),
    );
    expect(result).toContain('Alice');
    expect(result).toContain('APPLE');
    expect(result).toContain('RED');
    expect(result).toContain('Correct!');
  });

  it('formats word_guessed event with wrong result', () => {
    const result = plugin.formatEvent(
      makeFormatEvent('word_guessed', {
        guesserName: 'Bob',
        word: 'GHOST',
        color: 'neutral',
        correct: false,
      }),
    );
    expect(result).toContain('Wrong!');
  });

  it('formats turn_passed event with team name', () => {
    const result = plugin.formatEvent(
      makeFormatEvent('turn_passed', { team: 'blue' }),
    );
    expect(result).toContain('BLUE');
    expect(result.toLowerCase()).toContain('pass');
  });

  it('formats assassin_hit event', () => {
    const result = plugin.formatEvent(
      makeFormatEvent('assassin_hit', {
        guesserName: 'Carol',
        word: 'FROST',
        team: 'red',
      }),
    );
    expect(result).toContain('Carol');
    expect(result).toContain('FROST');
    expect(result).toContain('ASSASSIN');
    expect(result).toContain('RED');
  });

  it('formats game_end event with winner', () => {
    const result = plugin.formatEvent(
      makeFormatEvent('game_end', { winner: 'blue' }),
    );
    expect(result).toContain('BLUE');
    expect(result.toLowerCase()).toContain('game over');
  });

  it('formats game_end event with reason when provided', () => {
    const result = plugin.formatEvent(
      makeFormatEvent('game_end', { winner: 'red', reason: 'all words found' }),
    );
    expect(result).toContain('all words found');
  });

  it('formats score_update event with both scores when no perspective', () => {
    const result = plugin.formatEvent(
      makeFormatEvent('score_update', { redScore: 4, blueScore: 3 }),
    );
    expect(result).toContain('RED');
    expect(result).toContain('BLUE');
    expect(result).toContain('4');
    expect(result).toContain('3');
  });

  it('formats score_update from team perspective', () => {
    const result = plugin.formatEvent(
      makeFormatEvent('score_update', { redScore: 4, redTotal: 5 }),
      'red',
    );
    expect(result).toContain('RED');
    expect(result).toContain('4');
    expect(result).toContain('5');
  });

  it('formats round_start event with team and round number', () => {
    const result = plugin.formatEvent(
      makeFormatEvent('round_start', { team: 'red', round: 3 }),
    );
    expect(result).toContain('3');
    expect(result).toContain('RED');
  });

  it('formats unknown event type using phase and type', () => {
    const event: TurnEvent = {
      id: 'evt-x',
      botId: 'bot-1',
      sceneId: 'codenames:room-1',
      type: 'custom_event',
      phase: 'team_guess',
      data: {},
      timestamp: Date.now(),
    };
    const result = plugin.formatEvent(event);
    expect(result).toContain('team_guess');
    expect(result).toContain('custom_event');
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('CodenamesPlugin edge cases', () => {
  const plugin = new CodenamesPlugin();

  it('parseAction handles empty string without throwing', () => {
    const state = makeState({ phase: 'spymaster_clue' });
    const ctx = makeContext(state);
    expect(() => plugin.parseAction('', ctx)).not.toThrow();
  });

  it('parseAction on empty string for spymaster_clue has parseError', () => {
    const state = makeState({ phase: 'spymaster_clue' });
    const ctx = makeContext(state);
    const action = plugin.parseAction('', ctx);
    expect(action.type).toBe('clue');
    expect(action.metadata['parseError']).toBe(true);
  });

  it('parseAction for team_guess with empty string returns a guess with undefined target', () => {
    const state = makeState({
      phase: 'team_guess',
      guessesRemaining: 1,
      currentClue: { word: 'X', count: 1 },
    });
    const ctx = makeContext(state);
    const action = plugin.parseAction('', ctx);
    // Empty string cannot be mapped to a board word; type is still 'guess' with no target
    expect(action.type).toBe('guess');
    expect(action.target).toBeUndefined();
  });

  it('validateAction on a clue whose board-word check is case-insensitive', () => {
    const state = makeState({ phase: 'spymaster_clue' });
    const ctx = makeContext(state);
    // "apple" (lower) should still match "APPLE" on the board
    const action = makeAction({
      type: 'clue',
      metadata: { clueWord: 'apple', clueCount: 1 },
    });
    const result = plugin.validateAction(action, ctx);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('apple');
  });

  it('getDefaultAction fallback clue word is not a board word', () => {
    const state = makeState({ phase: 'spymaster_clue' });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'spymaster_clue' });
    const action = plugin.getDefaultAction(event, ctx);
    // The fallback clue word "PLACEHOLDER" is not on the default board
    const clueWord = action.metadata['clueWord'] as string;
    const boardWords = state.board.map((c) => c.word.toUpperCase());
    expect(boardWords).not.toContain(clueWord.toUpperCase());
  });

  it('buildPrompt does not include revealed words in unrevealed word list', () => {
    const board = makeBoard();
    const boardWithRevealed: BoardCard[] = board.map((c, i) =>
      i === 0 ? { ...c, revealed: true } : c, // APPLE revealed
    );
    const state = makeState({ phase: 'spymaster_clue', board: boardWithRevealed });
    const ctx = makeContext(state);
    const event = makeTurnEvent({ phase: 'spymaster_clue' });
    const messages = plugin.buildPrompt(event, ctx);
    const lastMsg = messages[messages.length - 1].content;
    // Unrevealed word list should not include APPLE
    // Find the line with "Unrevealed board words"
    const unrevealed = lastMsg
      .split('\n')
      .find((l) => l.startsWith('Unrevealed board words'));
    expect(unrevealed).toBeDefined();
    expect(unrevealed).not.toContain('APPLE');
  });
});
