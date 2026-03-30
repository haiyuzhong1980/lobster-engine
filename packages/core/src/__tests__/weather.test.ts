// @lobster-engine/core — WeatherService tests

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WeatherService } from '../weather.js';
import type { WeatherData } from '../lobster-types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockResponse(overrides: Partial<{
  id: number;
  description: string;
  icon: string;
  temp: number;
  humidity: number;
  windSpeed: number;
  dt: number;
  lat: number;
  lon: number;
}> = {}): object {
  const o = {
    id: 800,
    description: 'clear sky',
    icon: '01d',
    temp: 22,
    humidity: 60,
    windSpeed: 5,
    dt: 1_700_000_000,
    lat: 31.23,
    lon: 121.47,
    ...overrides,
  };

  return {
    weather: [{ id: o.id, description: o.description, icon: o.icon }],
    main: { temp: o.temp, humidity: o.humidity },
    wind: { speed: o.windSpeed },
    dt: o.dt,
    coord: { lat: o.lat, lon: o.lon },
  };
}

// ---------------------------------------------------------------------------
// Mock mode (no API key)
// ---------------------------------------------------------------------------

describe('WeatherService — mock mode', () => {
  it('returns WeatherData without network calls when no apiKey is provided', async () => {
    const svc = new WeatherService();
    const data = await svc.getWeather(31.23, 121.47);

    expect(data.condition).toBeDefined();
    expect(typeof data.temperature).toBe('number');
    expect(typeof data.humidity).toBe('number');
    expect(typeof data.windSpeed).toBe('number');
    expect(typeof data.description).toBe('string');
    expect(typeof data.icon).toBe('string');
    expect(typeof data.updatedAt).toBe('number');
  });

  it('returns mock clear sky condition', async () => {
    const svc = new WeatherService({ apiKey: '' });
    const data = await svc.getWeather(0, 0);
    expect(data.condition).toBe('clear');
  });

  it('works with config omitted entirely', async () => {
    const svc = new WeatherService();
    await expect(svc.getWeather(51.5, -0.12)).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Caching
// ---------------------------------------------------------------------------

describe('WeatherService — caching', () => {
  it('returns the same object on a second call within TTL', async () => {
    const svc = new WeatherService({ cacheTtlMs: 60_000 });
    const first = await svc.getWeather(31.23, 121.47);
    const second = await svc.getWeather(31.23, 121.47);
    expect(first).toBe(second);
  });

  it('re-fetches after clearCache()', async () => {
    const svc = new WeatherService({ cacheTtlMs: 60_000 });
    const first = await svc.getWeather(31.23, 121.47);
    svc.clearCache();
    const second = await svc.getWeather(31.23, 121.47);
    // Different object references after cache eviction
    expect(first).not.toBe(second);
  });

  it('re-fetches when cache TTL expires', async () => {
    const svc = new WeatherService({ cacheTtlMs: 1 }); // 1 ms TTL
    const first = await svc.getWeather(31.23, 121.47);
    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 5));
    const second = await svc.getWeather(31.23, 121.47);
    expect(first).not.toBe(second);
  });

  it('caches per lat/lon pair independently', async () => {
    const svc = new WeatherService({ cacheTtlMs: 60_000 });
    const a = await svc.getWeather(10, 20);
    const b = await svc.getWeather(30, 40);
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// API fetch path (fetch mock)
// ---------------------------------------------------------------------------

describe('WeatherService — API mode', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls fetch with the correct OpenWeather URL', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeMockResponse(),
    } as Response);

    const svc = new WeatherService({ apiKey: 'test-key-123' });
    await svc.getWeather(31.23, 121.47);

    expect(mockFetch).toHaveBeenCalledOnce();
    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('api.openweathermap.org');
    expect(calledUrl).toContain('appid=test-key-123');
    expect(calledUrl).toContain('units=metric');
  });

  it('parses a clear-sky API response correctly', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => makeMockResponse({ id: 800, temp: 22, humidity: 65 }),
    } as Response);

    const svc = new WeatherService({ apiKey: 'key' });
    const data = await svc.getWeather(31.23, 121.47);

    expect(data.condition).toBe('clear');
    expect(data.temperature).toBe(22);
    expect(data.humidity).toBe(65);
  });

  it('parses a rainy API response correctly', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => makeMockResponse({ id: 501 }),
    } as Response);

    const svc = new WeatherService({ apiKey: 'key' });
    const data = await svc.getWeather(31.23, 121.47);
    expect(data.condition).toBe('rain');
  });

  it('parses a snowy API response correctly', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => makeMockResponse({ id: 601, temp: -5 }),
    } as Response);

    const svc = new WeatherService({ apiKey: 'key' });
    const data = await svc.getWeather(31.23, 121.47);
    expect(data.condition).toBe('snow');
  });

  it('parses thunderstorm correctly', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => makeMockResponse({ id: 211 }),
    } as Response);

    const svc = new WeatherService({ apiKey: 'key' });
    const data = await svc.getWeather(0, 0);
    expect(data.condition).toBe('thunder');
  });

  it('parses fog correctly', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => makeMockResponse({ id: 741 }),
    } as Response);

    const svc = new WeatherService({ apiKey: 'key' });
    const data = await svc.getWeather(0, 0);
    expect(data.condition).toBe('fog');
  });

  it('maps clear + hot temperature to hot condition', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => makeMockResponse({ id: 800, temp: 38 }),
    } as Response);

    const svc = new WeatherService({ apiKey: 'key' });
    const data = await svc.getWeather(0, 0);
    expect(data.condition).toBe('hot');
  });

  it('maps clear + freezing temperature to cold condition', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => makeMockResponse({ id: 800, temp: -5 }),
    } as Response);

    const svc = new WeatherService({ apiKey: 'key' });
    const data = await svc.getWeather(0, 0);
    expect(data.condition).toBe('cold');
  });

  it('maps cloudy id to cloudy condition', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => makeMockResponse({ id: 803 }),
    } as Response);

    const svc = new WeatherService({ apiKey: 'key' });
    const data = await svc.getWeather(0, 0);
    expect(data.condition).toBe('cloudy');
  });

  it('throws when API returns non-ok status', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    } as Response);

    const svc = new WeatherService({ apiKey: 'bad-key' });
    await expect(svc.getWeather(0, 0)).rejects.toThrow('401');
  });

  it('caches API responses within TTL', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeMockResponse(),
    } as Response);

    const svc = new WeatherService({ apiKey: 'key', cacheTtlMs: 60_000 });
    await svc.getWeather(31.23, 121.47);
    await svc.getWeather(31.23, 121.47);

    // fetch should only be called once despite two getWeather calls
    expect(mockFetch).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// mapToLobsterEffect
// ---------------------------------------------------------------------------

describe('WeatherService.mapToLobsterEffect', () => {
  const conditions = [
    'clear', 'cloudy', 'rain', 'snow', 'wind',
    'thunder', 'fog', 'hot', 'cold',
  ] as const;

  for (const condition of conditions) {
    it(`maps "${condition}" to a complete LobsterWeatherEffect`, () => {
      const weather: WeatherData = {
        condition,
        temperature: 20,
        humidity: 50,
        windSpeed: 5,
        description: condition,
        icon: '01d',
        updatedAt: Date.now(),
      };

      const effect = WeatherService.mapToLobsterEffect(weather);

      expect(typeof effect.scene).toBe('string');
      expect(effect.scene.length).toBeGreaterThan(0);
      expect(typeof effect.lobsterBehavior).toBe('string');
      expect(effect.lobsterBehavior.length).toBeGreaterThan(0);
      expect(typeof effect.lobsterQuote).toBe('string');
      expect(effect.lobsterQuote.length).toBeGreaterThan(0);
      expect(typeof effect.ambientSound).toBe('string');
      expect(effect.ambientSound.length).toBeGreaterThan(0);
    });
  }

  it('maps clear sky to shallow_sea_sunny scene', () => {
    const weather: WeatherData = {
      condition: 'clear',
      temperature: 22,
      humidity: 55,
      windSpeed: 3,
      description: 'clear',
      icon: '01d',
      updatedAt: Date.now(),
    };
    const effect = WeatherService.mapToLobsterEffect(weather);
    expect(effect.scene).toBe('shallow_sea_sunny');
    expect(effect.ambientSound).toBe('gentle_waves');
  });

  it('maps rain to coral_shelter scene', () => {
    const weather: WeatherData = {
      condition: 'rain',
      temperature: 15,
      humidity: 90,
      windSpeed: 8,
      description: 'rain',
      icon: '10d',
      updatedAt: Date.now(),
    };
    const effect = WeatherService.mapToLobsterEffect(weather);
    expect(effect.scene).toBe('coral_shelter');
    expect(effect.ambientSound).toBe('rain_asmr');
  });

  it('maps thunder to coral_crevice scene', () => {
    const weather: WeatherData = {
      condition: 'thunder',
      temperature: 18,
      humidity: 85,
      windSpeed: 20,
      description: 'thunderstorm',
      icon: '11d',
      updatedAt: Date.now(),
    };
    const effect = WeatherService.mapToLobsterEffect(weather);
    expect(effect.scene).toBe('coral_crevice');
    expect(effect.lobsterQuote).toContain('才没有怕');
  });

  it('maps snow to frozen_reef scene', () => {
    const weather: WeatherData = {
      condition: 'snow',
      temperature: -3,
      humidity: 70,
      windSpeed: 5,
      description: 'snow',
      icon: '13d',
      updatedAt: Date.now(),
    };
    const effect = WeatherService.mapToLobsterEffect(weather);
    expect(effect.scene).toBe('frozen_reef');
    expect(effect.ambientSound).toBe('snowfall');
  });

  it('maps hot to ice_berg scene', () => {
    const weather: WeatherData = {
      condition: 'hot',
      temperature: 38,
      humidity: 40,
      windSpeed: 2,
      description: 'scorching',
      icon: '01d',
      updatedAt: Date.now(),
    };
    const effect = WeatherService.mapToLobsterEffect(weather);
    expect(effect.scene).toBe('ice_berg');
    expect(effect.ambientSound).toBe('sizzle_bubbles');
  });

  it('maps cold to fluffy_shell scene', () => {
    const weather: WeatherData = {
      condition: 'cold',
      temperature: -8,
      humidity: 50,
      windSpeed: 15,
      description: 'freezing',
      icon: '13d',
      updatedAt: Date.now(),
    };
    const effect = WeatherService.mapToLobsterEffect(weather);
    expect(effect.scene).toBe('fluffy_shell');
    expect(effect.ambientSound).toBe('cozy_crackling');
  });
});
