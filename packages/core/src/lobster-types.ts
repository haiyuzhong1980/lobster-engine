// @lobster-engine/core — Lobster companion product shared types

// ---------------------------------------------------------------------------
// Activity System
// ---------------------------------------------------------------------------

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

export interface ActivityEvent {
  readonly lobsterId: string;
  readonly type: ActivityType;
  readonly confidence: number; // 0-1
  readonly metadata: {
    readonly speed?: number;
    readonly steps?: number;
    readonly altitude?: number;
    readonly weather?: WeatherData;
  };
  readonly timestamp: number;
}

// ---------------------------------------------------------------------------
// Lobster Scene Mapping
// ---------------------------------------------------------------------------

export interface LobsterBehavior {
  readonly scene: string;       // e.g. 'shallow_sea', 'coral_tunnel', 'lobster_home'
  readonly action: string;      // e.g. 'walking_beach', 'riding_seahorse', 'hammock_chill'
  readonly soundEffect: string; // e.g. 'sand_footsteps', 'bubble_engine'
  readonly description: string; // human-readable
}

// ---------------------------------------------------------------------------
// Emotion System
// ---------------------------------------------------------------------------

export type EmotionType =
  | 'happy'
  | 'sleepy'
  | 'curious'
  | 'hungry'
  | 'warm'
  | 'proud'
  | 'surprised'
  | 'zen';

export type EmotionIntensity = 'low' | 'mid' | 'high';

export interface EmotionState {
  readonly happy: number;    // 0-100
  readonly sleepy: number;
  readonly curious: number;
  readonly hungry: number;
  readonly warm: number;
  readonly proud: number;
  readonly surprised: number;
  readonly zen: number;
}

export interface EmotionTrigger {
  readonly type: string; // e.g. 'app_open', 'encounter', 'activity_change'
  readonly changes: Partial<Record<EmotionType, number>>; // delta values
}

// ---------------------------------------------------------------------------
// Personality DNA
// ---------------------------------------------------------------------------

export interface PersonalityDNA {
  readonly introversion_extroversion: number; // -100 to 100
  readonly laziness_curiosity: number;
  readonly emotional_rational: number;
  readonly talkative_silent: number;
  readonly foodie_ascetic: number;
  readonly nightowl_earlybird: number;
}

export type PersonalityTrait = keyof PersonalityDNA;

export interface PersonalityDrift {
  readonly trait: PersonalityTrait;
  readonly delta: number;  // max ±3 per week
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// Weather
// ---------------------------------------------------------------------------

export type WeatherCondition =
  | 'clear'
  | 'cloudy'
  | 'rain'
  | 'snow'
  | 'wind'
  | 'thunder'
  | 'fog'
  | 'hot'
  | 'cold';

export interface WeatherData {
  readonly condition: WeatherCondition;
  readonly temperature: number; // Celsius
  readonly humidity: number;    // 0-100
  readonly windSpeed: number;   // m/s
  readonly description: string;
  readonly icon: string;
  readonly updatedAt: number;
}

// ---------------------------------------------------------------------------
// Encounter / Social
// ---------------------------------------------------------------------------

export type RelationLevel =
  | 'stranger'
  | 'nodding'
  | 'familiar'
  | 'iron'
  | 'soul';

export interface EncounterEvent {
  readonly reporterId: string;
  readonly peerId: string;
  readonly method: 'ble' | 'gps';
  readonly rssi?: number;    // BLE signal strength
  readonly geoHash?: string; // GPS approximate location
  readonly timestamp: number;
}

export interface EncounterRecord {
  readonly id: string;
  readonly lobsterA: string;
  readonly lobsterB: string;
  readonly location: string; // geoHash
  readonly method: 'ble' | 'gps';
  readonly conversationId?: string;
  readonly timestamp: number;
  /** Whether a gift was exchanged during this encounter */
  readonly giftExchanged: boolean;
  /** Whether a collaboration was completed during this encounter */
  readonly collaborationCompleted: boolean;
}

export interface SocialRelation {
  readonly lobsterA: string;
  readonly lobsterB: string;
  readonly level: RelationLevel;
  readonly encounterCount: number;
  readonly firstMet: number;
  readonly lastMet: number;
  readonly giftsExchanged: number;
  readonly collaborationsCompleted: number;
  readonly personalityMatch: number; // 0-100
  /** Unique calendar days (YYYY-MM-DD) on which encounters have occurred */
  readonly uniqueDays: readonly string[];
  /** Whether lobsterA has mutually confirmed readiness for the next tier */
  readonly confirmedByA: boolean;
  /** Whether lobsterB has mutually confirmed readiness for the next tier */
  readonly confirmedByB: boolean;
}

// ---------------------------------------------------------------------------
// Lobster Core State
// ---------------------------------------------------------------------------

export interface LobsterState {
  readonly id: string;
  readonly ownerId: string;
  readonly name: string;
  readonly level: number;
  readonly personality: PersonalityDNA;
  readonly emotion: EmotionState;
  readonly currentActivity: ActivityType;
  readonly currentScene: string;
  readonly lazyCoin: number;
  readonly shells: number;
  readonly stats: LobsterStats;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface LobsterStats {
  readonly totalSteps: number;
  readonly totalEncounters: number;
  readonly totalDays: number;
  readonly longestIdle: number;           // seconds
  readonly favoriteActivity: ActivityType;
  readonly lyingFlatIndex: number;        // 0-5 stars
}

// ---------------------------------------------------------------------------
// Diary
// ---------------------------------------------------------------------------

export interface DiaryEntry {
  readonly id: string;
  readonly lobsterId: string;
  readonly date: string; // YYYY-MM-DD
  readonly timeline: readonly DiaryTimelineItem[];
  readonly summary: DiarySummary;
  readonly content: string; // AI-generated diary text
  readonly createdAt: number;
}

export interface DiaryTimelineItem {
  readonly time: string; // HH:MM
  readonly icon: string;
  readonly activity: ActivityType;
  readonly description: string;
  readonly isEncounter?: boolean;
}

export interface DiarySummary {
  readonly lyingFlatIndex: number;
  readonly totalSteps: number;
  readonly encounterCount: number;
  readonly mood: EmotionType;
  readonly quote: string;
}

// ---------------------------------------------------------------------------
// Arena Mini
// ---------------------------------------------------------------------------

export type ArenaMode = 'debate' | 'lying_flat' | 'counting';

export interface ArenaMatch {
  readonly id: string;
  readonly mode: ArenaMode;
  readonly lobsterA: string;
  readonly lobsterB: string;
  readonly topic?: string; // for debate mode
  readonly status: 'pending' | 'active' | 'finished';
  readonly result?: ArenaResult;
  readonly createdAt: number;
}

export interface ArenaResult {
  readonly winner: string | 'draw';
  readonly scoreA: number;
  readonly scoreB: number;
  readonly rewardA: { lazyCoin: number; shells: number };
  readonly rewardB: { lazyCoin: number; shells: number };
}

// ---------------------------------------------------------------------------
// Reverse Incentive
// ---------------------------------------------------------------------------

export interface IncentiveReward {
  readonly lazyCoin: number;
  readonly reason: string;
  readonly lobsterReaction: string; // what the lobster says/does
}
