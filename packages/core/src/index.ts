// @lobster-engine/core — Public API

export type {
  LogLevel,
  Logger,
  BotCredentials,
  SessionStatus,
  BotState,
  TurnPhase,
  TurnEvent,
  ActionSpec,
  ActionResult,
  SceneStatus,
  SceneMetadata,
  EngineConfig,
  EngineEvent,
} from './types.js';

export type { QueryFilter, StorageProvider } from './storage.js';

export type {
  ChatMessage,
  ChatOptions,
  ChatUsage,
  ChatResponse,
  AdapterCapabilities,
  AIPlatformAdapter,
} from './adapter.js';

export type {
  SceneContext,
  ActionValidationResult,
  ScenePlugin,
} from './scene.js';

export type { EngineEventMap, EngineEmitter } from './events.js';
export { TypedEventEmitter } from './events.js';

export type { JoinSceneOptions } from './engine.js';
export { LobsterEngine } from './engine.js';

export type { ConfigSource } from './config.js';
export {
  EnvConfigSource,
  FileConfigSource,
  DefaultConfigSource,
  ConfigManager,
} from './config.js';

export type { StateTier, StateManagerConfig } from './state.js';
export { StateManager } from './state.js';

export { MemoryProvider } from './memory-provider.js';

export { sanitizePrompt, buildMessages, truncateMessages, fallbackResponse } from './prompt.js';

export { ScenePluginRegistry } from './scene-registry.js';

export { AdapterRegistry, AdapterNotFoundError } from './adapter-registry.js';

export type {
  AdapterPoolConfig,
  CircuitBreakerConfig,
  CircuitState,
  AdapterStats,
} from './adapter-pool.js';
export {
  AdapterPool,
  AdapterPoolQueueFullError,
  AdapterPoolCircuitOpenError,
  AdapterPoolTimeoutError,
  AdapterPoolNoAdaptersError,
  AdapterPoolShutdownError,
} from './adapter-pool.js';

export type { NatsConfig, NatsClientOptions, SubscriptionHandle } from './nats.js';
export { NatsClient } from './nats.js';

export type {
  HealthOverallStatus,
  HealthCheckStatus,
  HealthCheck,
  HealthStatus,
  WorkerHeartbeatPayload,
  WorkerRecord,
  HealthChecker,
  HealthMonitorOptions,
} from './health.js';
export { HealthMonitor } from './health.js';

export type { WorkerConfig, WorkerHealth } from './worker.js';
export { BotWorker } from './worker.js';

export * from './nats-subjects.js';

export type { LogContext } from './logger.js';
export { createLogger, withTraceId, generateTraceId } from './logger.js';

// ---------------------------------------------------------------------------
// Lobster companion product — shared types
// ---------------------------------------------------------------------------

export type {
  ActivityType,
  ActivityEvent,
  LobsterBehavior,
  EmotionType,
  EmotionIntensity,
  EmotionState,
  EmotionTrigger,
  PersonalityDNA,
  PersonalityTrait,
  PersonalityDrift,
  WeatherCondition,
  WeatherData,
  RelationLevel,
  EncounterEvent,
  EncounterRecord,
  SocialRelation,
  LobsterState,
  LobsterStats,
  DiaryEntry,
  DiaryTimelineItem,
  DiarySummary,
  ArenaMode,
  ArenaMatch,
  ArenaResult,
  IncentiveReward,
} from './lobster-types.js';

export { EmotionEngine } from './emotion.js';

// ---------------------------------------------------------------------------
// Social system — B.5/B.6
// ---------------------------------------------------------------------------

export type {
  UpgradeRequirements,
  GeoReport,
  GroupEffect,
  GroupEffectType,
  ShellReward,
} from './social.js';
export { RelationManager, GroupEffectDetector, ShellEconomy } from './social.js';

// ---------------------------------------------------------------------------
// Personality DNA Engine — A.3
// ---------------------------------------------------------------------------

export type { WeeklyBehaviorStats, DialogueStyle } from './personality.js';
export { PersonalityEngine } from './personality.js';

// ---------------------------------------------------------------------------
// Weather Service — A.6
// ---------------------------------------------------------------------------

export type { WeatherServiceConfig, LobsterWeatherEffect } from './weather.js';
export { WeatherService } from './weather.js';
