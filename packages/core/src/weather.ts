// @lobster-engine/core — A.6 Weather Service

import type { WeatherData, WeatherCondition } from './lobster-types.js';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface WeatherServiceConfig {
  /** OpenWeather API key.  When absent or empty the service runs in mock mode. */
  readonly apiKey?: string;
  /** Cache TTL in milliseconds.  Defaults to 30 minutes. */
  readonly cacheTtlMs?: number;
  readonly defaultLat?: number;
  readonly defaultLon?: number;
}

export interface LobsterWeatherEffect {
  readonly scene: string;
  readonly lobsterBehavior: string;
  readonly lobsterQuote: string;
  readonly ambientSound: string;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface CacheEntry {
  readonly data: WeatherData;
  readonly expiresAt: number;
}

/** Minimal shape we expect from the OpenWeather "current weather" JSON */
interface OpenWeatherResponse {
  readonly weather: ReadonlyArray<{ readonly id: number; readonly description: string; readonly icon: string }>;
  readonly main: {
    readonly temp: number;
    readonly humidity: number;
  };
  readonly wind: {
    readonly speed: number;
  };
  readonly dt: number;
  readonly coord: {
    readonly lat: number;
    readonly lon: number;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const OPENWEATHER_URL = 'https://api.openweathermap.org/data/2.5/weather';

/** Mapping from weather condition to lobster narrative */
const CONDITION_EFFECTS: Record<WeatherCondition, LobsterWeatherEffect> = {
  clear: {
    scene: 'shallow_sea_sunny',
    lobsterBehavior: '晒壳',
    lobsterQuote: '今天阳光真好',
    ambientSound: 'gentle_waves',
  },
  cloudy: {
    scene: 'ocean_dim',
    lobsterBehavior: '戴墨镜(反讽)',
    lobsterQuote: '天阴了，更适合躺着',
    ambientSound: 'soft_current',
  },
  rain: {
    scene: 'coral_shelter',
    lobsterBehavior: '贝壳小伞听雨',
    lobsterQuote: '最喜欢下雨天了',
    ambientSound: 'rain_asmr',
  },
  snow: {
    scene: 'frozen_reef',
    lobsterBehavior: '看雪',
    lobsterQuote: '天空坏了！掉白东西！',
    ambientSound: 'snowfall',
  },
  wind: {
    scene: 'turbulent_current',
    lobsterBehavior: '被水流吹歪',
    lobsterQuote: '风好大...不想动',
    ambientSound: 'wind_howl',
  },
  thunder: {
    scene: 'coral_crevice',
    lobsterBehavior: '躲在缝里探头',
    lobsterQuote: '好可怕...才没有怕',
    ambientSound: 'thunder_rumble',
  },
  fog: {
    scene: 'murky_water',
    lobsterBehavior: '戴口罩(讽刺)',
    lobsterQuote: '看不清...正好摸鱼',
    ambientSound: 'muffled_ocean',
  },
  hot: {
    scene: 'ice_berg',
    lobsterBehavior: '靠冰山',
    lobsterQuote: '好热...我要融化了',
    ambientSound: 'sizzle_bubbles',
  },
  cold: {
    scene: 'fluffy_shell',
    lobsterBehavior: '穿毛绒壳套',
    lobsterQuote: '冷冷的好舒服',
    ambientSound: 'cozy_crackling',
  },
};

// ---------------------------------------------------------------------------
// Condition derivation
// ---------------------------------------------------------------------------

/**
 * Map an OpenWeather weather-id and temperature to our `WeatherCondition`.
 *
 * OpenWeather ID ranges:
 *   2xx — thunderstorm
 *   3xx — drizzle
 *   5xx — rain
 *   6xx — snow
 *   7xx — atmosphere (mist / fog / tornado …)
 *   800 — clear sky
 *   80x — clouds
 */
function deriveCondition(weatherId: number, tempCelsius: number): WeatherCondition {
  if (weatherId >= 200 && weatherId < 300) return 'thunder';
  if (weatherId >= 300 && weatherId < 600) return 'rain';
  if (weatherId >= 600 && weatherId < 700) return 'snow';
  if (weatherId >= 700 && weatherId < 800) return 'fog';
  if (weatherId === 800) {
    if (tempCelsius >= 35) return 'hot';
    if (tempCelsius <= 0) return 'cold';
    return 'clear';
  }
  // 801–804 = clouds
  return 'cloudy';
}

// ---------------------------------------------------------------------------
// Mock data builder
// ---------------------------------------------------------------------------

function buildMockWeather(lat: number, lon: number): WeatherData {
  return {
    condition: 'clear',
    temperature: 22,
    humidity: 60,
    windSpeed: 10,
    description: 'mock clear sky',
    icon: '01d',
    updatedAt: Date.now(),
  };
}

// Suppress unused variable lint warning — lat/lon are intentionally unused in
// the mock but kept in the signature for symmetry.
void (buildMockWeather as unknown);

// ---------------------------------------------------------------------------
// WeatherService
// ---------------------------------------------------------------------------

export class WeatherService {
  private readonly apiKey: string;
  private readonly cacheTtlMs: number;
  private readonly defaultLat: number;
  private readonly defaultLon: number;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(config: WeatherServiceConfig = {}) {
    this.apiKey = config.apiKey ?? '';
    this.cacheTtlMs = config.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.defaultLat = config.defaultLat ?? 31.2304;  // Shanghai
    this.defaultLon = config.defaultLon ?? 121.4737;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Fetch current weather for the given coordinates.
   *
   * Results are cached per (lat, lon) for `cacheTtlMs` milliseconds.
   * When no API key is configured the service returns deterministic mock data.
   */
  async getWeather(lat: number, lon: number): Promise<WeatherData> {
    const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const fresh = this.apiKey === ''
      ? this.buildMockData(lat, lon)
      : await this.fetchFromApi(lat, lon);

    this.cache.set(cacheKey, { data: fresh, expiresAt: Date.now() + this.cacheTtlMs });
    return fresh;
  }

  /**
   * Map a `WeatherData` snapshot to lobster-specific narrative effects.
   */
  static mapToLobsterEffect(weather: WeatherData): LobsterWeatherEffect {
    return CONDITION_EFFECTS[weather.condition];
  }

  /** Evict all cached entries. */
  clearCache(): void {
    this.cache.clear();
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private buildMockData(lat: number, lon: number): WeatherData {
    return {
      condition: 'clear',
      temperature: 22,
      humidity: 60,
      windSpeed: 10,
      description: 'mock clear sky',
      icon: '01d',
      updatedAt: Date.now(),
    };
  }

  private async fetchFromApi(lat: number, lon: number): Promise<WeatherData> {
    const url = new URL(OPENWEATHER_URL);
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lon));
    url.searchParams.set('appid', this.apiKey);
    url.searchParams.set('units', 'metric');

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(
        `OpenWeather API request failed: ${response.status} ${response.statusText}`,
      );
    }

    const raw: unknown = await response.json();
    return this.parseApiResponse(raw, lat, lon);
  }

  private parseApiResponse(raw: unknown, lat: number, lon: number): WeatherData {
    if (
      raw === null ||
      typeof raw !== 'object' ||
      !('weather' in raw) ||
      !('main' in raw) ||
      !('wind' in raw)
    ) {
      throw new Error('Unexpected OpenWeather API response shape');
    }

    const typed = raw as OpenWeatherResponse;
    const primaryWeather = typed.weather[0];
    if (primaryWeather === undefined) {
      throw new Error('OpenWeather API response contained no weather entries');
    }

    const tempC = typed.main.temp;
    const condition = deriveCondition(primaryWeather.id, tempC);

    return {
      condition,
      temperature: tempC,
      humidity: typed.main.humidity,
      windSpeed: typed.wind.speed,
      description: primaryWeather.description,
      icon: primaryWeather.icon,
      updatedAt: typed.dt * 1000,
    };
  }
}
