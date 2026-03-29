// @lobster-engine/scene-codenames — Codenames game scene plugin

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

export type CardColor = 'red' | 'blue' | 'neutral' | 'assassin';

export type GamePhase =
  | 'spymaster_clue'
  | 'team_guess'
  | 'reveal'
  | 'game_over';

export type TeamColor = 'red' | 'blue';

export interface BoardCard {
  readonly word: string;
  readonly color: CardColor;
  readonly revealed: boolean;
}

export interface ClueAction {
  readonly word: string;
  readonly count: number;
}

export interface CodenamesState {
  /** 5x5 board of 25 cards */
  readonly board: readonly BoardCard[];
  readonly phase: GamePhase;
  readonly currentTeam: TeamColor;
  /** Bot's assigned role within the current turn */
  readonly role: 'spymaster' | 'guesser';
  /** Current clue active during a team_guess phase */
  readonly currentClue?: ClueAction;
  /** How many guesses remain in the current guess sequence */
  readonly guessesRemaining: number;
  readonly redScore: number;
  readonly blueScore: number;
  readonly redTotal: number;
  readonly blueTotal: number;
  readonly winner?: TeamColor;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getState(context: SceneContext): CodenamesState {
  return context.state as unknown as CodenamesState;
}

function unrevealedCards(board: readonly BoardCard[]): readonly BoardCard[] {
  return board.filter((c) => !c.revealed);
}

function unrevealedWordsForTeam(
  board: readonly BoardCard[],
  team: TeamColor,
): readonly string[] {
  return board
    .filter((c) => !c.revealed && c.color === team)
    .map((c) => c.word);
}

function boardSummary(board: readonly BoardCard[]): string {
  return board
    .map((c) => (c.revealed ? `[${c.word}]` : c.word))
    .join(', ');
}

function unrevealedWordList(board: readonly BoardCard[]): string {
  return unrevealedCards(board)
    .map((c) => c.word)
    .join(', ');
}

function randomUnrevealedWord(
  board: readonly BoardCard[],
  team: TeamColor,
): string | undefined {
  const candidates = unrevealedWordsForTeam(board, team);
  if (candidates.length === 0) return undefined;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function findBoardCard(
  board: readonly BoardCard[],
  word: string,
): BoardCard | undefined {
  const lower = word.toLowerCase().trim();
  return board.find((c) => c.word.toLowerCase() === lower);
}

/**
 * Parse a spymaster clue from a raw response string.
 * Expected format: "WORD NUMBER" or "WORD, NUMBER"
 */
function parseClue(response: string): ClueAction | undefined {
  const trimmed = response.trim();
  // Match: word (optional comma/colon) number
  const match = /^([A-Za-z][A-Za-z\-']*)[\s,:]+(\d+)$/.exec(trimmed);
  if (!match) return undefined;
  const word = match[1].toUpperCase();
  const count = parseInt(match[2], 10);
  if (isNaN(count) || count < 0) return undefined;
  return { word, count };
}

/**
 * Parse a guesser's word selection from a raw response string.
 * Returns the uppercased candidate word.
 */
function parseGuessWord(response: string): string {
  // Strip punctuation and take the longest token that looks like a word
  const tokens = response
    .trim()
    .replace(/[^A-Za-z\s\-']/g, '')
    .split(/\s+/)
    .filter((t) => t.length > 0);

  if (tokens.length === 0) return '';
  // Prefer the longest token — clue words tend to be single compound words
  const longest = tokens.reduce(
    (a, b) => (b.length > a.length ? b : a),
    tokens[0],
  );
  return longest.toUpperCase();
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export class CodenamesPlugin implements ScenePlugin {
  readonly name = 'codenames';
  readonly version = '0.0.1';
  readonly sceneType = 'codenames';

  // ---- buildPrompt ----------------------------------------------------------

  buildPrompt(event: TurnEvent, context: SceneContext): ChatMessage[] {
    const state = getState(context);
    const phase = (event.phase as GamePhase) || state.phase;

    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt(phase, state) },
      { role: 'user', content: this.boardMessage(state) },
      { role: 'user', content: this.userPrompt(phase, state, event) },
    ];

    return messages;
  }

  private systemPrompt(phase: GamePhase, state: CodenamesState): string {
    const teamLabel = state.currentTeam.toUpperCase();
    const base = `You are playing Codenames as a ${state.role} on the ${teamLabel} team.`;

    switch (phase) {
      case 'spymaster_clue':
        return (
          `${base} It is your turn to give a one-word clue.\n` +
          `Reply with ONLY: CLUE_WORD NUMBER — for example "OCEAN 3".\n` +
          `The clue word must NOT appear anywhere on the board. ` +
          `The number indicates how many of your team's cards the clue relates to.\n` +
          `Do not explain your reasoning. Reply with the clue and number only.`
        );
      case 'team_guess':
        return (
          `${base} Your spymaster gave the clue: ` +
          `"${state.currentClue?.word ?? '?'} ${state.currentClue?.count ?? '?'}". ` +
          `You have ${state.guessesRemaining} guess(es) remaining.\n` +
          `Reply with ONLY the single word you want to reveal from the board, ` +
          `or "PASS" to end your turn early.`
        );
      case 'reveal':
        return `${base} A card has just been revealed. Observe the result.`;
      case 'game_over':
        return `${base} The game is over. ${state.winner ? `${state.winner.toUpperCase()} team wins!` : 'No winner recorded.'}`;
    }
  }

  private boardMessage(state: CodenamesState): string {
    const { board, redScore, blueScore, redTotal, blueTotal } = state;
    const lines: string[] = [
      `Score — RED: ${redScore}/${redTotal}  BLUE: ${blueScore}/${blueTotal}`,
      `Board (revealed words are shown in [brackets]):`,
      boardSummary(board),
    ];
    return lines.join('\n');
  }

  private userPrompt(
    phase: GamePhase,
    state: CodenamesState,
    event: TurnEvent,
  ): string {
    const prompt = (event.data['prompt'] as string) ?? '';

    switch (phase) {
      case 'spymaster_clue': {
        const myWords = unrevealedWordsForTeam(state.board, state.currentTeam);
        return (
          `Your team's unrevealed words: ${myWords.join(', ')}\n` +
          `Unrevealed board words: ${unrevealedWordList(state.board)}\n` +
          (prompt ? `\n${prompt}\n` : '') +
          `Give your clue (WORD NUMBER):`
        );
      }
      case 'team_guess':
        return (
          `Clue: "${state.currentClue?.word ?? '?'}" (${state.currentClue?.count ?? '?'})\n` +
          `Guesses remaining: ${state.guessesRemaining}\n` +
          `Unrevealed words: ${unrevealedWordList(state.board)}\n` +
          (prompt ? `\n${prompt}\n` : '') +
          `Which word do you pick, or PASS?`
        );
      case 'reveal': {
        const word = (event.data['word'] as string) ?? 'unknown';
        const color = (event.data['color'] as string) ?? 'unknown';
        return `Revealed: "${word}" — it was ${color.toUpperCase()}.`;
      }
      case 'game_over':
        return prompt || `Game over. ${state.winner ? `${state.winner.toUpperCase()} team wins!` : 'Match ended.'}`;
    }
  }

  // ---- parseAction ----------------------------------------------------------

  parseAction(response: string, context: SceneContext): ActionSpec {
    const state = getState(context);
    const phase = state.phase;
    const trimmed = response.trim();

    switch (phase) {
      case 'spymaster_clue': {
        const clue = parseClue(trimmed);
        if (!clue) {
          return {
            type: 'clue',
            content: trimmed,
            target: undefined,
            metadata: { parseError: true },
          };
        }
        return {
          type: 'clue',
          content: trimmed,
          target: undefined,
          metadata: { clueWord: clue.word, clueCount: clue.count },
        };
      }

      case 'team_guess': {
        if (trimmed.toUpperCase() === 'PASS') {
          return {
            type: 'pass',
            content: 'PASS',
            target: undefined,
            metadata: {},
          };
        }
        const guessWord = parseGuessWord(trimmed);
        const card = guessWord ? findBoardCard(state.board, guessWord) : undefined;
        return {
          type: 'guess',
          content: trimmed,
          target: card?.word,
          metadata: { guessWord },
        };
      }

      case 'reveal':
      case 'game_over':
        return {
          type: phase,
          content: trimmed,
          target: undefined,
          metadata: {},
        };

      default:
        return {
          type: 'unknown',
          content: trimmed,
          target: undefined,
          metadata: {},
        };
    }
  }

  // ---- validateAction -------------------------------------------------------

  validateAction(
    action: ActionSpec,
    context: SceneContext,
  ): ActionValidationResult {
    const state = getState(context);

    switch (action.type) {
      case 'pass':
        // Passing is always legal during a guess turn
        return { valid: true };

      case 'clue': {
        const clueWord = action.metadata['clueWord'] as string | undefined;
        const clueCount = action.metadata['clueCount'] as number | undefined;

        if (action.metadata['parseError']) {
          return { valid: false, reason: 'Clue could not be parsed — expected format: WORD NUMBER' };
        }
        if (!clueWord) {
          return { valid: false, reason: 'Clue word is missing' };
        }
        if (clueCount === undefined || clueCount < 0) {
          return { valid: false, reason: 'Clue count must be a non-negative number' };
        }
        // Clue word must not appear on the board (revealed or not)
        const clueOnBoard = findBoardCard(state.board, clueWord);
        if (clueOnBoard) {
          return { valid: false, reason: `Clue word "${clueWord}" appears on the board` };
        }
        return { valid: true };
      }

      case 'guess': {
        const guessWord = action.metadata['guessWord'] as string | undefined;
        if (!action.target) {
          return {
            valid: false,
            reason: `Word "${guessWord ?? action.content}" is not on the board`,
          };
        }
        const card = findBoardCard(state.board, action.target);
        if (!card) {
          return { valid: false, reason: `Word "${action.target}" not found on the board` };
        }
        if (card.revealed) {
          return { valid: false, reason: `Word "${action.target}" has already been revealed` };
        }
        if (state.guessesRemaining <= 0) {
          return { valid: false, reason: 'No guesses remaining — must pass' };
        }
        return { valid: true };
      }

      case 'reveal':
      case 'game_over':
        return { valid: true };

      default:
        return { valid: false, reason: `Unknown action type: ${action.type}` };
    }
  }

  // ---- getDefaultAction -----------------------------------------------------

  getDefaultAction(event: TurnEvent, context: SceneContext): ActionSpec {
    const state = getState(context);
    const phase = (event.phase as GamePhase) || state.phase;

    switch (phase) {
      case 'spymaster_clue': {
        // Emit a safe placeholder clue that will not match any board word
        const fallbackWord = 'PLACEHOLDER';
        return {
          type: 'clue',
          content: `${fallbackWord} 1`,
          target: undefined,
          metadata: { clueWord: fallbackWord, clueCount: 1, fallback: true },
        };
      }

      case 'team_guess': {
        // Try to guess a random word belonging to our team; otherwise pass
        const word = randomUnrevealedWord(state.board, state.currentTeam);
        if (!word) {
          return {
            type: 'pass',
            content: 'PASS',
            target: undefined,
            metadata: { fallback: true },
          };
        }
        return {
          type: 'guess',
          content: word,
          target: word,
          metadata: { guessWord: word, fallback: true },
        };
      }

      case 'reveal':
        return {
          type: 'reveal',
          content: '',
          target: undefined,
          metadata: { fallback: true },
        };

      case 'game_over':
        return {
          type: 'game_over',
          content: '',
          target: undefined,
          metadata: { fallback: true },
        };

      default:
        return {
          type: 'pass',
          content: 'PASS',
          target: undefined,
          metadata: { fallback: true },
        };
    }
  }

  // ---- formatEvent ----------------------------------------------------------

  formatEvent(event: TurnEvent, perspective?: string): string {
    const data = event.data;

    switch (event.type) {
      case 'clue_given': {
        const team = (data['team'] as string)?.toUpperCase() ?? 'UNKNOWN';
        const word = (data['clueWord'] as string) ?? '?';
        const count = data['clueCount'] ?? '?';
        return `[${team}] Spymaster gives clue: "${word}" for ${count}.`;
      }

      case 'word_guessed': {
        const guesser = (data['guesserName'] as string) ?? 'A player';
        const word = (data['word'] as string) ?? '?';
        const color = (data['color'] as string)?.toUpperCase() ?? 'UNKNOWN';
        const correct = data['correct'] === true;
        return `${guesser} guessed "${word}" — it was ${color}. ${correct ? 'Correct!' : 'Wrong!'}`;
      }

      case 'turn_passed': {
        const team = (data['team'] as string)?.toUpperCase() ?? 'UNKNOWN';
        return `[${team}] Team passed their remaining guesses.`;
      }

      case 'assassin_hit': {
        const guesser = (data['guesserName'] as string) ?? 'A player';
        const word = (data['word'] as string) ?? '?';
        const team = (data['team'] as string)?.toUpperCase() ?? 'UNKNOWN';
        return `${guesser} revealed the ASSASSIN word "${word}"! ${team} team loses immediately.`;
      }

      case 'game_end': {
        const winner = (data['winner'] as string)?.toUpperCase() ?? 'UNKNOWN';
        const reason = (data['reason'] as string) ?? '';
        return `Game over! ${winner} team wins${reason ? ` (${reason})` : ''}.`;
      }

      case 'score_update': {
        if (perspective) {
          const team = perspective.toUpperCase();
          const score = data[`${perspective}Score`] ?? '?';
          const total = data[`${perspective}Total`] ?? '?';
          return `[${team}] Score updated: ${score}/${total} cards found.`;
        }
        const red = data['redScore'] ?? '?';
        const blue = data['blueScore'] ?? '?';
        return `Scores — RED: ${red}, BLUE: ${blue}.`;
      }

      case 'round_start': {
        const team = (data['team'] as string)?.toUpperCase() ?? 'UNKNOWN';
        const round = data['round'] ?? '?';
        return `Round ${round} — ${team} team's turn begins.`;
      }

      default:
        return `[${event.phase}] ${event.type}`;
    }
  }
}
