// @lobster-engine/scene-werewolf — WerewolfClient
// Connects to a lobster-arena Worker via HTTP polling.

import type { ActionSpec } from '@lobster-engine/core';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface WerewolfClientConfig {
  readonly workerUrl: string;
  readonly botId: string;
  readonly botToken: string;
  readonly pollIntervalMs?: number;
  readonly timeoutMs?: number;
}

export interface GameState {
  readonly phase: string;
  readonly round: number;
  readonly players: ReadonlyArray<{ id: string; name: string; alive: boolean }>;
  readonly pendingAction: boolean;
  readonly lastEvents: ReadonlyArray<{
    type: string;
    data: unknown;
    timestamp: number;
  }>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 30000;

function resolvedConfig(config: WerewolfClientConfig): Required<WerewolfClientConfig> {
  return {
    workerUrl: config.workerUrl.replace(/\/$/, ''),
    botId: config.botId,
    botToken: config.botToken,
    pollIntervalMs: config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
}

function authHeaders(botToken: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${botToken}`,
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

async function assertOk(response: Response, context: string): Promise<void> {
  if (!response.ok) {
    let body = '';
    try {
      body = await response.text();
    } catch {
      // ignore body read failure
    }
    throw new Error(
      `${context}: HTTP ${response.status} ${response.statusText}${body ? ` — ${body}` : ''}`,
    );
  }
}

// ---------------------------------------------------------------------------
// WerewolfClient
// ---------------------------------------------------------------------------

export class WerewolfClient {
  private readonly config: Required<WerewolfClientConfig>;
  private pollingHandle: ReturnType<typeof setInterval> | undefined;

  constructor(config: WerewolfClientConfig) {
    this.config = resolvedConfig(config);
  }

  // ---- connect -------------------------------------------------------------

  /**
   * Validates worker reachability and registers the bot's presence.
   * Throws if the worker is unreachable or rejects the credentials.
   */
  async connect(): Promise<void> {
    const { workerUrl, botId, botToken } = this.config;
    let response: Response;
    try {
      response = await fetch(`${workerUrl}/api/bot/connect`, {
        method: 'POST',
        headers: authHeaders(botToken),
        body: JSON.stringify({ botId }),
      });
    } catch (error: unknown) {
      throw new Error(`WerewolfClient.connect failed: ${getErrorMessage(error)}`);
    }
    await assertOk(response, 'WerewolfClient.connect');
  }

  // ---- disconnect ----------------------------------------------------------

  /**
   * Signals the worker that this bot is departing.
   * Also stops any active polling loop.
   */
  async disconnect(): Promise<void> {
    this.stopPolling();
    const { workerUrl, botId, botToken } = this.config;
    let response: Response;
    try {
      response = await fetch(`${workerUrl}/api/bot/disconnect`, {
        method: 'POST',
        headers: authHeaders(botToken),
        body: JSON.stringify({ botId }),
      });
    } catch (error: unknown) {
      throw new Error(`WerewolfClient.disconnect failed: ${getErrorMessage(error)}`);
    }
    await assertOk(response, 'WerewolfClient.disconnect');
  }

  // ---- pollState -----------------------------------------------------------

  /**
   * Fetches the current game state from the worker.
   * Returns a fully-typed, immutable GameState.
   */
  async pollState(): Promise<GameState> {
    const { workerUrl, botId, botToken } = this.config;
    const url = `${workerUrl}/api/game/state?botId=${encodeURIComponent(botId)}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: authHeaders(botToken),
      });
    } catch (error: unknown) {
      throw new Error(`WerewolfClient.pollState failed: ${getErrorMessage(error)}`);
    }
    await assertOk(response, 'WerewolfClient.pollState');
    const raw: unknown = await response.json();
    return parseGameState(raw);
  }

  // ---- submitAction --------------------------------------------------------

  /**
   * Posts an action to the worker on behalf of the bot.
   */
  async submitAction(action: ActionSpec): Promise<void> {
    const { workerUrl, botId, botToken } = this.config;
    let response: Response;
    try {
      response = await fetch(`${workerUrl}/api/game/action`, {
        method: 'POST',
        headers: authHeaders(botToken),
        body: JSON.stringify({ botId, action }),
      });
    } catch (error: unknown) {
      throw new Error(`WerewolfClient.submitAction failed: ${getErrorMessage(error)}`);
    }
    await assertOk(response, 'WerewolfClient.submitAction');
  }

  // ---- startPolling --------------------------------------------------------

  /**
   * Starts an interval-based polling loop.
   * The provided callback is invoked with every GameState snapshot.
   * Calling startPolling while already polling replaces the previous loop.
   */
  startPolling(onEvent: (state: GameState) => void): void {
    this.stopPolling();
    this.pollingHandle = setInterval(() => {
      this.pollState()
        .then(onEvent)
        .catch((_err: unknown) => {
          // Swallow per-tick errors so the loop continues.
          // Callers that need error visibility should wrap onEvent.
        });
    }, this.config.pollIntervalMs);
  }

  // ---- stopPolling ---------------------------------------------------------

  /**
   * Stops the active polling loop, if any.
   */
  stopPolling(): void {
    if (this.pollingHandle !== undefined) {
      clearInterval(this.pollingHandle);
      this.pollingHandle = undefined;
    }
  }

  // ---- waitForTurn ---------------------------------------------------------

  /**
   * Returns a Promise that resolves with the GameState once
   * `pendingAction` becomes true, or rejects after `timeoutMs`.
   */
  waitForTurn(timeoutMs?: number): Promise<GameState> {
    const deadline = timeoutMs ?? this.config.timeoutMs;
    const pollIntervalMs = this.config.pollIntervalMs;

    return new Promise<GameState>((resolve, reject) => {
      const started = Date.now();
      let settled = false;
      let nextTick: ReturnType<typeof setTimeout> | undefined;

      const settle = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        if (nextTick !== undefined) {
          clearTimeout(nextTick);
          nextTick = undefined;
        }
        fn();
      };

      const scheduleNext = (): void => {
        nextTick = setTimeout(tick, pollIntervalMs);
      };

      const tick = (): void => {
        nextTick = undefined;
        if (settled) return;

        if (Date.now() - started >= deadline) {
          settle(() =>
            reject(new Error(`WerewolfClient.waitForTurn timed out after ${deadline}ms`)),
          );
          return;
        }

        this.pollState()
          .then((state) => {
            if (settled) return;
            if (state.pendingAction) {
              settle(() => resolve(state));
            } else {
              scheduleNext();
            }
          })
          .catch((error: unknown) => {
            settle(() =>
              reject(
                new Error(`WerewolfClient.waitForTurn poll error: ${getErrorMessage(error)}`),
              ),
            );
          });
      };

      nextTick = setTimeout(tick, 0);
    });
  }
}

// ---------------------------------------------------------------------------
// Runtime type narrowing — parseGameState
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPlayerEntry(value: unknown): value is { id: string; name: string; alive: boolean } {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['name'] === 'string' &&
    typeof value['alive'] === 'boolean'
  );
}

function isEventEntry(value: unknown): value is { type: string; data: unknown; timestamp: number } {
  return (
    isRecord(value) &&
    typeof value['type'] === 'string' &&
    typeof value['timestamp'] === 'number'
  );
}

function parseGameState(raw: unknown): GameState {
  if (!isRecord(raw)) {
    throw new Error('WerewolfClient: invalid GameState — expected object');
  }

  const phase = raw['phase'];
  const round = raw['round'];
  const pendingAction = raw['pendingAction'];
  const playersRaw = raw['players'];
  const lastEventsRaw = raw['lastEvents'];

  if (typeof phase !== 'string') {
    throw new Error('WerewolfClient: invalid GameState.phase');
  }
  if (typeof round !== 'number') {
    throw new Error('WerewolfClient: invalid GameState.round');
  }
  if (typeof pendingAction !== 'boolean') {
    throw new Error('WerewolfClient: invalid GameState.pendingAction');
  }
  if (!Array.isArray(playersRaw)) {
    throw new Error('WerewolfClient: invalid GameState.players');
  }
  if (!Array.isArray(lastEventsRaw)) {
    throw new Error('WerewolfClient: invalid GameState.lastEvents');
  }

  const players = playersRaw.map((entry, i) => {
    if (!isPlayerEntry(entry)) {
      throw new Error(`WerewolfClient: invalid GameState.players[${i}]`);
    }
    return { id: entry.id, name: entry.name, alive: entry.alive };
  });

  const lastEvents = lastEventsRaw.map((entry, i) => {
    if (!isEventEntry(entry)) {
      throw new Error(`WerewolfClient: invalid GameState.lastEvents[${i}]`);
    }
    return { type: entry.type, data: entry.data, timestamp: entry.timestamp };
  });

  return { phase, round, pendingAction, players, lastEvents };
}
