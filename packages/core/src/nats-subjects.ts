// @lobster-engine/core — NATS Subject Conventions
//
// All subjects follow the pattern: <domain>.<entity-id>.<action>
// Wildcards: `*` matches one token, `>` matches one or more tokens.
//
// Two APIs are exported:
//   1. `NatsSubjects` — a single typed const object for ergonomic access.
//   2. Named exports — individual functions/constants for tree-shaking.

// ---------------------------------------------------------------------------
// Subject token validation — prevents NATS subject injection attacks
// ---------------------------------------------------------------------------

const SUBJECT_TOKEN_RE = /^[a-zA-Z0-9_-]{1,128}$/;

/**
 * Validate that a value is safe to embed in a NATS subject.
 * Returns `true` when the value matches `[a-zA-Z0-9_-]{1,128}`.
 */
export function validateSubjectToken(value: string): boolean {
  return SUBJECT_TOKEN_RE.test(value);
}

/**
 * Assert that a value is a valid NATS subject token.
 * Throws a `RangeError` when validation fails.
 */
function requireValidToken(value: string, label: string): void {
  if (!validateSubjectToken(value)) {
    throw new RangeError(
      `Invalid ${label}: must match /^[a-zA-Z0-9_-]{1,128}$/, got "${value}"`,
    );
  }
}

// ---------------------------------------------------------------------------
// NatsSubjects — unified typed object
// ---------------------------------------------------------------------------

export const NatsSubjects = {
  // Bot subjects
  botEvent: (botId: string): string => {
    requireValidToken(botId, 'botId');
    return `bot.${botId}.event`;
  },
  botAction: (botId: string): string => {
    requireValidToken(botId, 'botId');
    return `bot.${botId}.action`;
  },
  botState: (botId: string): string => {
    requireValidToken(botId, 'botId');
    return `bot.${botId}.state`;
  },

  // Scene subjects
  sceneBroadcast: (sceneId: string): string => {
    requireValidToken(sceneId, 'sceneId');
    return `scene.${sceneId}.broadcast`;
  },
  sceneState: (sceneId: string): string => {
    requireValidToken(sceneId, 'sceneId');
    return `scene.${sceneId}.state`;
  },

  // System subjects
  systemHealth: 'system.health' as const,
  systemMetrics: 'system.metrics' as const,
  systemControl: 'system.control' as const,

  // Worker subjects
  workerHeartbeat: (workerId: string): string => {
    requireValidToken(workerId, 'workerId');
    return `worker.${workerId}.heartbeat`;
  },
  workerAssign: 'worker.assign' as const,
  workerResult: 'worker.result' as const,
} as const;

// ---------------------------------------------------------------------------
// Bot subjects (named exports — kept for backward compatibility)
// ---------------------------------------------------------------------------

/** Events targeted at a specific bot (turn events, state updates). */
export const botEvent = (botId: string): string => {
  requireValidToken(botId, 'botId');
  return `bot.${botId}.event`;
};

/** Action results from a specific bot. */
export const botAction = (botId: string): string => {
  requireValidToken(botId, 'botId');
  return `bot.${botId}.action`;
};

/** State change notifications for a specific bot. */
export const botState = (botId: string): string => {
  requireValidToken(botId, 'botId');
  return `bot.${botId}.state`;
};

/** Subscribe to all events for any bot. */
export const BOT_EVENT_ALL = 'bot.*.event' as const;

/** Subscribe to all actions from any bot. */
export const BOT_ACTION_ALL = 'bot.*.action' as const;

// ---------------------------------------------------------------------------
// Scene subjects
// ---------------------------------------------------------------------------

/** Broadcast events within a scene (visible to all participants). */
export const sceneBroadcast = (sceneId: string): string => {
  requireValidToken(sceneId, 'sceneId');
  return `scene.${sceneId}.broadcast`;
};

/** Scene lifecycle events (created, started, ended). */
export const sceneLifecycle = (sceneId: string): string => {
  requireValidToken(sceneId, 'sceneId');
  return `scene.${sceneId}.lifecycle`;
};

/** Subscribe to all scene broadcasts. */
export const SCENE_BROADCAST_ALL = 'scene.*.broadcast' as const;

/** Subscribe to all scene lifecycle events. */
export const SCENE_LIFECYCLE_ALL = 'scene.*.lifecycle' as const;

// ---------------------------------------------------------------------------
// Worker subjects
// ---------------------------------------------------------------------------

/** Queue group for worker task distribution. Workers compete for messages. */
export const WORKER_TASK_QUEUE = 'worker.task' as const;

/** Worker heartbeat — each worker publishes periodically. */
export const workerHeartbeat = (workerId: string): string => {
  requireValidToken(workerId, 'workerId');
  return `worker.${workerId}.heartbeat`;
};

/** Subscribe to all worker heartbeats. */
export const WORKER_HEARTBEAT_ALL = 'worker.*.heartbeat' as const;

/** Worker result — published after task completion. */
export const workerResult = (workerId: string): string => {
  requireValidToken(workerId, 'workerId');
  return `worker.${workerId}.result`;
};

// ---------------------------------------------------------------------------
// System subjects
// ---------------------------------------------------------------------------

/** System-wide health check (request/reply pattern). */
export const SYSTEM_HEALTH = 'system.health' as const;

/** System-wide metrics collection. */
export const SYSTEM_METRICS = 'system.metrics' as const;

/** System shutdown broadcast — all components listen. */
export const SYSTEM_SHUTDOWN = 'system.shutdown' as const;

/** System configuration updates. */
export const SYSTEM_CONFIG = 'system.config' as const;

// ---------------------------------------------------------------------------
// AI Adapter subjects
// ---------------------------------------------------------------------------

/** AI chat request — sent to adapter pool. */
export const AI_CHAT_REQUEST = 'ai.chat.request' as const;

/** AI chat response — result from adapter pool. */
export const aiChatResponse = (requestId: string): string => {
  requireValidToken(requestId, 'requestId');
  return `ai.chat.response.${requestId}`;
};

/** AI adapter health — individual adapter status. */
export const aiAdapterHealth = (adapterName: string): string => {
  requireValidToken(adapterName, 'adapterName');
  return `ai.adapter.${adapterName}.health`;
};

// ---------------------------------------------------------------------------
// Queue group names
// ---------------------------------------------------------------------------

/** Worker queue group — ensures each task is processed by exactly one worker. */
export const QUEUE_WORKERS = 'lobster-workers' as const;

/** Gateway queue group — load-balanced API instances. */
export const QUEUE_GATEWAY = 'lobster-gateway' as const;

/** AI pool queue group — load-balanced adapter instances. */
export const QUEUE_AI_POOL = 'lobster-ai-pool' as const;
