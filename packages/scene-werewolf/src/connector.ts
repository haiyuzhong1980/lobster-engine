// @lobster-engine/scene-werewolf — LobsterArenaConnector

import type { SceneMetadata } from '@lobster-engine/core';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ArenaConnectorConfig {
  readonly arenaUrl: string;
  readonly apiKey?: string;
  readonly timeoutMs?: number;
}

export interface BotRegistration {
  readonly botId: string;
  readonly botToken: string;
  readonly displayName: string;
}

export interface InviteCode {
  readonly code: string;
  readonly sceneId: string;
  readonly expiresAt: number;
}

export interface MatchResult {
  readonly sceneId: string;
  readonly players: ReadonlyArray<{ id: string; name: string; role?: string }>;
  readonly startedAt: number;
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class ArenaApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly endpoint: string,
  ) {
    super(message);
    this.name = 'ArenaApiError';
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildHeaders(apiKey: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (apiKey !== undefined) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  return headers;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function assertOk(
  response: Response,
  endpoint: string,
): Promise<unknown> {
  if (response.ok) {
    return parseResponseBody(response);
  }
  let message = `HTTP ${response.status}`;
  try {
    const body = await parseResponseBody(response);
    if (
      body !== null &&
      typeof body === 'object' &&
      'message' in body &&
      typeof (body as Record<string, unknown>)['message'] === 'string'
    ) {
      message = (body as Record<string, string>)['message'];
    } else if (typeof body === 'string' && body.length > 0) {
      message = body;
    }
  } catch {
    // retain the default message
  }
  throw new ArenaApiError(message, response.status, endpoint);
}

// ---------------------------------------------------------------------------
// Connector
// ---------------------------------------------------------------------------

export class LobsterArenaConnector {
  readonly #baseUrl: string;
  readonly #apiKey: string | undefined;
  readonly #timeoutMs: number;

  constructor(config: ArenaConnectorConfig) {
    this.#baseUrl = config.arenaUrl.replace(/\/+$/, '');
    this.#apiKey = config.apiKey;
    this.#timeoutMs = config.timeoutMs ?? 30_000;
  }

  // ---- private fetch wrapper -----------------------------------------------

  #fetch(endpoint: string, init: RequestInit): Promise<Response> {
    const url = `${this.#baseUrl}${endpoint}`;
    const signal = AbortSignal.timeout(this.#timeoutMs);
    return fetch(url, { ...init, signal });
  }

  // ---- registerBot ---------------------------------------------------------

  async registerBot(name: string, platform: string): Promise<BotRegistration> {
    const endpoint = '/api/bots/register';
    const response = await this.#fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(this.#apiKey),
      body: JSON.stringify({ name, platform }),
    });
    const body = await assertOk(response, endpoint);
    return body as BotRegistration;
  }

  // ---- unregisterBot -------------------------------------------------------

  async unregisterBot(botId: string): Promise<void> {
    const endpoint = `/api/bots/${encodeURIComponent(botId)}`;
    const response = await this.#fetch(endpoint, {
      method: 'DELETE',
      headers: buildHeaders(this.#apiKey),
    });
    await assertOk(response, endpoint);
  }

  // ---- createInvite --------------------------------------------------------

  async createInvite(
    sceneType: string,
    config?: Record<string, unknown>,
  ): Promise<InviteCode> {
    const endpoint = '/api/invites';
    const response = await this.#fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(this.#apiKey),
      body: JSON.stringify({ sceneType, config: config ?? {} }),
    });
    const body = await assertOk(response, endpoint);
    return body as InviteCode;
  }

  // ---- joinByInvite --------------------------------------------------------

  async joinByInvite(botId: string, code: string): Promise<MatchResult> {
    const endpoint = `/api/invites/${encodeURIComponent(code)}/join`;
    const response = await this.#fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(this.#apiKey),
      body: JSON.stringify({ botId }),
    });
    const body = await assertOk(response, endpoint);
    return body as MatchResult;
  }

  // ---- joinMatchmaking -----------------------------------------------------

  async joinMatchmaking(
    botId: string,
    sceneType: string,
  ): Promise<MatchResult> {
    const endpoint = '/api/matchmaking/join';
    const response = await this.#fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(this.#apiKey),
      body: JSON.stringify({ botId, sceneType }),
    });
    const body = await assertOk(response, endpoint);
    return body as MatchResult;
  }

  // ---- leaveMatchmaking ----------------------------------------------------

  async leaveMatchmaking(botId: string): Promise<void> {
    const endpoint = `/api/matchmaking/${encodeURIComponent(botId)}`;
    const response = await this.#fetch(endpoint, {
      method: 'DELETE',
      headers: buildHeaders(this.#apiKey),
    });
    await assertOk(response, endpoint);
  }

  // ---- getStatus -----------------------------------------------------------

  async getStatus(sceneId: string): Promise<SceneMetadata> {
    const endpoint = `/api/scenes/${encodeURIComponent(sceneId)}`;
    const response = await this.#fetch(endpoint, {
      method: 'GET',
      headers: buildHeaders(this.#apiKey),
    });
    const body = await assertOk(response, endpoint);
    return body as SceneMetadata;
  }
}
