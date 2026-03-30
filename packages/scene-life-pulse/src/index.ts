// @lobster-engine/scene-life-pulse — Life-pulse scene plugin
//
// Maps real-world user activity (steps, transport, sleep …) to lobster
// in-world behaviours, calculates reverse-incentive lazy-coin rewards, and
// detects special transport narrative events.

import type {
  ScenePlugin,
  SceneContext,
  ActionValidationResult,
  ChatMessage,
  TurnEvent,
  ActionSpec,
} from '@lobster-engine/core';

// ---------------------------------------------------------------------------
// Public domain types
// ---------------------------------------------------------------------------

/**
 * Activity types sourced from the device health/motion API.
 * Each value maps to a unique in-world lobster behaviour.
 */
export type ActivityType =
  | 'idle'
  | 'walking'
  | 'running'
  | 'cycling'
  | 'subway'
  | 'bus'
  | 'driving'
  | 'train'
  | 'plane'
  | 'boat'
  | 'sleeping'
  | 'eating'
  | 'listening_music'
  | 'phone_call'
  | 'charging';

/** In-world behaviour descriptor for one activity type. */
export interface LobsterBehavior {
  /** The in-world scene location where the lobster appears. */
  readonly scene: string;
  /** The animation/action the lobster performs. */
  readonly action: string;
  /** Sound effect tag played during the behaviour. */
  readonly soundEffect: string;
  /** Short human-readable description (Chinese copy for the product). */
  readonly description: string;
}

/** Lazy-coin incentive reward returned after activity evaluation. */
export interface IncentiveReward {
  /** Number of lazy coins awarded (0 when no rule matches). */
  readonly lazyCoin: number;
  /**
   * Short reaction message shown to the user.
   * `null` when no reward is granted.
   */
  readonly reaction: string | null;
}

/** A single historical activity record, e.g. from a daily health summary. */
export interface ActivityEvent {
  /** Activity type detected at this timestamp. */
  readonly activityType: ActivityType;
  /** Unix timestamp (milliseconds) when the activity was recorded. */
  readonly timestamp: number;
  /** For walking/running: total step count in the session. */
  readonly steps?: number;
  /** GPS path as an array of [lat, lng] pairs. */
  readonly gpsPath?: ReadonlyArray<readonly [number, number]>;
}

/** A special transport narrative event detected from an activity history. */
export interface SpecialTransportEvent {
  /** Machine-readable event key. */
  readonly type:
    | 'commute_routine'
    | 'new_route'
    | 'long_journey'
    | 'late_return'
    | 'traffic_jam';
  /** Lobster reaction text shown to the user. */
  readonly reaction: string;
  /** Extra data specific to the event type (may be empty). */
  readonly metadata: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Activity → Behaviour mapping table
// ---------------------------------------------------------------------------

const ACTIVITY_MAP: Readonly<Record<ActivityType, LobsterBehavior>> = {
  idle: {
    scene: 'lobster_home',
    action: 'hammock_chill',
    soundEffect: 'bubble_soft',
    description: '在吊床上发呆，吹泡泡',
  },
  walking: {
    scene: 'shallow_sea',
    action: 'beach_walk',
    soundEffect: 'sand_footsteps',
    description: '在海底沙滩漫步',
  },
  running: {
    scene: 'coral_reef',
    action: 'fast_swim',
    soundEffect: 'water_rush',
    description: '急速游泳',
  },
  cycling: {
    scene: 'sea_highway',
    action: 'riding_seahorse',
    soundEffect: 'seahorse_hooves',
    description: '骑海马',
  },
  subway: {
    scene: 'coral_tunnel',
    action: 'tunnel_train',
    soundEffect: 'tunnel_echo',
    description: '海底隧道列车',
  },
  bus: {
    scene: 'fish_crowd',
    action: 'sardine_bus',
    soundEffect: 'crowd_noise',
    description: '沙丁鱼巴士',
  },
  driving: {
    scene: 'sea_highway',
    action: 'shell_car',
    soundEffect: 'bubble_engine',
    description: '驾驶大贝壳',
  },
  train: {
    scene: 'deep_tunnel',
    action: 'swordfish_express',
    soundEffect: 'speed_current',
    description: '旗鱼特快',
  },
  plane: {
    scene: 'sky_above',
    action: 'flying_fish',
    soundEffect: 'water_burst',
    description: '骑飞鱼冲出海面',
  },
  boat: {
    scene: 'surface',
    action: 'boat_watching',
    soundEffect: 'gentle_waves',
    description: '趴在船底看水里',
  },
  sleeping: {
    scene: 'lobster_bedroom',
    action: 'spiral_shell',
    soundEffect: 'ocean_whitenoise',
    description: '钻进海螺壳',
  },
  eating: {
    scene: 'lobster_canteen',
    action: 'comfort_food',
    soundEffect: 'chewing',
    description: '吃海底comfort food',
  },
  listening_music: {
    scene: 'current_scene',
    action: 'shell_headphones',
    soundEffect: 'body_sway',
    description: '戴贝壳耳机',
  },
  phone_call: {
    scene: 'current_scene',
    action: 'conch_phone',
    soundEffect: 'mouth_move',
    description: '拿海螺打电话',
  },
  charging: {
    scene: 'lobster_home',
    action: 'energy_coral',
    soundEffect: 'charge_bubbles',
    description: '能量珊瑚充电',
  },
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Minutes elapsed from a Unix-ms timestamp to now. */
function minutesSince(timestamp: number): number {
  return (Date.now() - timestamp) / 60_000;
}

/** Returns the hour-of-day (0–23) for a Unix-ms timestamp in local time. */
function hourOfDay(timestamp: number): number {
  return new Date(timestamp).getHours();
}

/** Returns the ISO weekday (0 = Sunday … 6 = Saturday) for a Unix-ms timestamp. */
function weekday(timestamp: number): number {
  return new Date(timestamp).getDay();
}

/** Returns true when the timestamp falls on a Saturday or Sunday. */
function isWeekend(timestamp: number): boolean {
  const day = weekday(timestamp);
  return day === 0 || day === 6;
}

/**
 * Simple GPS path comparison — two paths are "the same route" when every
 * waypoint is within ~0.01° (≈1 km) of the corresponding waypoint in the
 * reference path and both paths have the same length.
 */
function isSameRoute(
  a: ReadonlyArray<readonly [number, number]>,
  b: ReadonlyArray<readonly [number, number]>,
): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  const THRESHOLD = 0.01;
  return a.every(([lat, lng], i) => {
    const ref = b[i];
    if (ref === undefined) return false;
    return Math.abs(lat - ref[0]) < THRESHOLD && Math.abs(lng - ref[1]) < THRESHOLD;
  });
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * LifePulsePlugin — maps user activity to lobster in-world scenes.
 *
 * Static helpers (`calculateIncentive`, `detectSpecialEvent`, `getBehavior`)
 * are pure functions for use outside the engine if needed.
 */
export class LifePulsePlugin implements ScenePlugin {
  readonly name = 'life-pulse';
  readonly version = '1.0.0';
  readonly sceneType = 'life-pulse';

  // ---- Public static helpers -----------------------------------------------

  /**
   * Return the `LobsterBehavior` for a given `ActivityType`.
   * This is the authoritative mapping table lookup.
   */
  static getBehavior(activity: ActivityType): LobsterBehavior {
    return ACTIVITY_MAP[activity];
  }

  /**
   * Calculate the reverse-incentive lazy-coin reward.
   *
   * Rules (evaluated in order; first match wins):
   * - idle for > 60 min           → +10 "人生赢家"
   * - walking < 500 steps         → +5  "完美的一天"
   * - walking > 10 000 steps      → +3  "今天辛苦了，我帮你躺"
   * - working late (after 21:00)  → +2  "主人快下班！"
   * - weekend idle all day        → +15 "周末就该这样"
   *
   * The `durationMinutes` parameter is the continuous duration of the given
   * activity at the time of evaluation.  For step-count rules the `steps`
   * property on the event record is used instead (pass 0 when not applicable).
   */
  static calculateIncentive(
    activity: ActivityType,
    durationMinutes: number,
    opts: {
      readonly steps?: number;
      readonly timestamp?: number;
    } = {},
  ): IncentiveReward {
    const steps = opts.steps ?? 0;
    const ts = opts.timestamp ?? Date.now();

    // Weekend idle all day (≥ 480 min = 8 h continuous idle on a weekend)
    if (activity === 'idle' && isWeekend(ts) && durationMinutes >= 480) {
      return { lazyCoin: 15, reaction: '周末就该这样' };
    }

    // Idle > 60 min on any day
    if (activity === 'idle' && durationMinutes > 60) {
      return { lazyCoin: 10, reaction: '人生赢家' };
    }

    // Walking < 500 steps
    if (activity === 'walking' && steps < 500) {
      return { lazyCoin: 5, reaction: '完美的一天' };
    }

    // Walking > 10 000 steps
    if (activity === 'walking' && steps > 10_000) {
      return { lazyCoin: 3, reaction: '今天辛苦了，我帮你躺' };
    }

    // Working late — any activity recorded after 21:00
    if (hourOfDay(ts) >= 21) {
      return { lazyCoin: 2, reaction: '主人快下班！' };
    }

    return { lazyCoin: 0, reaction: null };
  }

  /**
   * Detect a special transport narrative from a sequence of activity events.
   * Returns the first matching event or `null` when nothing special is found.
   *
   * Detection rules (in priority order):
   * 1. `traffic_jam`      — transport events with frequent stop-start (>= 5
   *                         alternating non-transport + transport events within
   *                         15 min window, or a single transport event lasting
   *                         > 15 min with zero GPS movement).
   * 2. `late_return`      — any transport event recorded after 22:00.
   * 3. `long_journey`     — total transport duration > 120 min.
   * 4. `new_route`        — GPS path present and not matching any previous path
   *                         in the history (only the first two events compared).
   * 5. `commute_routine`  — same GPS route appears 5 or more times in history.
   */
  static detectSpecialEvent(
    events: readonly ActivityEvent[],
  ): SpecialTransportEvent | null {
    const TRANSPORT_TYPES = new Set<ActivityType>([
      'subway',
      'bus',
      'driving',
      'train',
      'plane',
      'boat',
      'cycling',
    ]);

    const transportEvents = events.filter((e) => TRANSPORT_TYPES.has(e.activityType));

    if (transportEvents.length === 0) return null;

    // --- traffic_jam detection -----------------------------------------------
    // Heuristic: more than 15 transport-type events clustered within 15 minutes
    // (i.e. dense stop-start pattern).
    const fifteenMinMs = 15 * 60_000;
    for (let i = 0; i < transportEvents.length; i++) {
      const window = transportEvents.filter(
        (e) =>
          Math.abs(e.timestamp - (transportEvents[i]?.timestamp ?? 0)) <=
          fifteenMinMs,
      );
      if (window.length > 15) {
        return {
          type: 'traffic_jam',
          reaction: '堵车了！龙虾掏出了掌机',
          metadata: { eventCount: window.length },
        };
      }
    }

    // --- late_return detection -----------------------------------------------
    const lateReturn = transportEvents.find((e) => hourOfDay(e.timestamp) >= 22);
    if (lateReturn !== undefined) {
      return {
        type: 'late_return',
        reaction: '龙虾在副驾驶睡着了',
        metadata: { hour: hourOfDay(lateReturn.timestamp) },
      };
    }

    // --- long_journey detection ----------------------------------------------
    // Sum the gaps between consecutive transport events as a duration proxy.
    if (transportEvents.length >= 2) {
      const first = transportEvents[0];
      const last = transportEvents[transportEvents.length - 1];
      if (first !== undefined && last !== undefined) {
        const totalMinutes = (last.timestamp - first.timestamp) / 60_000;
        if (totalMinutes > 120) {
          return {
            type: 'long_journey',
            reaction: '龙虾写了一首诗',
            metadata: { durationMinutes: Math.round(totalMinutes) },
          };
        }
      }
    }

    // --- new_route detection -------------------------------------------------
    const withPath = transportEvents.filter(
      (e) => e.gpsPath !== undefined && e.gpsPath.length > 0,
    );
    if (withPath.length >= 2) {
      const first = withPath[0];
      const second = withPath[1];
      if (
        first !== undefined &&
        second !== undefined &&
        first.gpsPath !== undefined &&
        second.gpsPath !== undefined &&
        !isSameRoute(first.gpsPath, second.gpsPath)
      ) {
        return {
          type: 'new_route',
          reaction: '龙虾好奇地四处张望',
          metadata: {},
        };
      }
    }

    // --- commute_routine detection -------------------------------------------
    // Group transport events by GPS path fingerprint; if any path appears >= 5
    // times, it is a commute routine.
    const pathCounts = new Map<string, number>();
    for (const e of withPath) {
      if (e.gpsPath === undefined) continue;
      const key = e.gpsPath.map(([a, b]) => `${a.toFixed(3)},${b.toFixed(3)}`).join('|');
      pathCounts.set(key, (pathCounts.get(key) ?? 0) + 1);
    }
    for (const count of pathCounts.values()) {
      if (count >= 5) {
        return {
          type: 'commute_routine',
          reaction: '今天又是这条路...我都能背下来了',
          metadata: { occurrences: count },
        };
      }
    }

    return null;
  }

  // ---- ScenePlugin interface -----------------------------------------------

  /**
   * Build the AI prompt for a life-pulse turn event.
   *
   * The system message establishes the lobster's persona and current behaviour.
   * User messages describe what the user is doing and ask the lobster to react.
   */
  buildPrompt(event: TurnEvent, context: SceneContext): ChatMessage[] {
    const activity = (event.data['activityType'] as ActivityType | undefined) ?? 'idle';
    const behavior = LifePulsePlugin.getBehavior(activity);
    const lobsterId = context.botId;
    const prompt = (event.data['prompt'] as string | undefined) ?? '';

    const system: ChatMessage = {
      role: 'system',
      content: [
        `你是一只名叫「躺平龙虾」的虚拟宠物龙虾 (id: ${lobsterId})。`,
        `当前场景: ${behavior.scene}。`,
        `当前动作: ${behavior.action}。`,
        `你的口头禅是懒洋洋的，喜欢躺平。`,
        `用中文回复，简短可爱，不超过 2 句话。`,
      ].join(' '),
    };

    const userContent = prompt.length > 0
      ? prompt
      : `主人正在进行「${activity}」，你在${behavior.description}。请发表感想。`;

    return [
      system,
      { role: 'user', content: userContent },
    ];
  }

  /**
   * Parse the adapter response into an ActionSpec.
   *
   * For life-pulse the only action type is `'react'` — the lobster emitting a
   * reaction string in response to the user's activity.
   */
  parseAction(response: string, _context: SceneContext): ActionSpec {
    return {
      type: 'react',
      content: response.trim(),
      target: undefined,
      metadata: {},
    };
  }

  /**
   * Validate a life-pulse action.
   *
   * A `react` action is valid when its content is a non-empty string.
   * All other action types are rejected.
   */
  validateAction(action: ActionSpec, _context: SceneContext): ActionValidationResult {
    if (action.type !== 'react') {
      return { valid: false, reason: `Unknown action type: ${action.type}` };
    }
    if (action.content.trim().length === 0) {
      return { valid: false, reason: 'Reaction content must not be empty' };
    }
    return { valid: true };
  }

  /**
   * Return a safe default reaction when the adapter response is unusable.
   *
   * The fallback message is drawn from the current activity's description.
   */
  getDefaultAction(event: TurnEvent, _context: SceneContext): ActionSpec {
    const activity = (event.data['activityType'] as ActivityType | undefined) ?? 'idle';
    const behavior = LifePulsePlugin.getBehavior(activity);
    return {
      type: 'react',
      content: `${behavior.description}，真是惬意呢～`,
      target: undefined,
      metadata: { fallback: true },
    };
  }

  /**
   * Format a life-pulse turn event as a human-readable string.
   *
   * Supports the following event types:
   * - `activity_update` — user activity changed
   * - `incentive_awarded` — lazy-coin reward was granted
   * - `special_event` — a special transport narrative was detected
   * - Everything else falls back to `[phase] type`.
   */
  formatEvent(event: TurnEvent, _perspective?: string): string {
    const data = event.data;

    switch (event.type) {
      case 'activity_update': {
        const activity = (data['activityType'] as ActivityType | undefined) ?? 'idle';
        const behavior = LifePulsePlugin.getBehavior(activity);
        return `活动更新: ${activity} — 龙虾正在${behavior.description}`;
      }

      case 'incentive_awarded': {
        const coins = data['lazyCoin'] as number | undefined;
        const reaction = data['reaction'] as string | undefined;
        return `获得懒蛋币 +${coins ?? 0}！「${reaction ?? ''}」`;
      }

      case 'special_event': {
        const eventType = data['eventType'] as string | undefined;
        const reaction = data['reaction'] as string | undefined;
        return `特殊事件 [${eventType ?? 'unknown'}]: ${reaction ?? ''}`;
      }

      default:
        return `[${event.phase}] ${event.type}`;
    }
  }
}
