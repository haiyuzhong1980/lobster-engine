// @lobster-engine/core — Zero-dependency Prometheus text format metrics

// ---------------------------------------------------------------------------
// Core value types
// ---------------------------------------------------------------------------

export interface MetricValue {
  readonly labels: Readonly<Record<string, string>>;
  readonly value: number;
  readonly timestamp?: number;
}

export type MetricType = 'counter' | 'gauge' | 'histogram';

// ---------------------------------------------------------------------------
// Internal label key helpers
// ---------------------------------------------------------------------------

function labelsToKey(labels: Readonly<Record<string, string>>): string {
  return Object.keys(labels)
    .sort()
    .map((k) => `${k}="${labels[k]}"`)
    .join(',');
}

function labelsToPrometheus(labels: Readonly<Record<string, string>>): string {
  const entries = Object.keys(labels)
    .sort()
    .map((k) => `${k}="${escapeLabel(labels[k] ?? '')}"`);
  return entries.length > 0 ? `{${entries.join(',')}}` : '';
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function formatValue(value: number): string {
  if (!isFinite(value)) {
    return value > 0 ? '+Inf' : '-Inf';
  }
  // Prometheus expects decimal notation; avoid scientific notation for small integers
  return String(value);
}

// ---------------------------------------------------------------------------
// Counter
// ---------------------------------------------------------------------------

/**
 * A monotonically increasing counter.
 * Labels create separate series; each series is tracked independently.
 */
export class Counter {
  readonly name: string;
  readonly help: string;
  private readonly values = new Map<string, number>();

  constructor(name: string, help: string) {
    this.name = name;
    this.help = help;
  }

  inc(labels: Readonly<Record<string, string>> = {}, amount = 1): void {
    if (amount < 0) {
      throw new RangeError(`Counter.inc: amount must be non-negative, got ${amount}`);
    }
    const key = labelsToKey(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + amount);
  }

  get(labels: Readonly<Record<string, string>> = {}): number {
    return this.values.get(labelsToKey(labels)) ?? 0;
  }

  reset(labels: Readonly<Record<string, string>> = {}): void {
    this.values.set(labelsToKey(labels), 0);
  }

  /** Reset all label series. */
  resetAll(): void {
    this.values.clear();
  }

  toPrometheusLines(): string[] {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} counter`,
    ];
    if (this.values.size === 0) {
      lines.push(`${this.name} 0`);
      return lines;
    }
    for (const [key, value] of this.values) {
      const labelsStr = key.length > 0 ? `{${key}}` : '';
      lines.push(`${this.name}${labelsStr} ${formatValue(value)}`);
    }
    return lines;
  }
}

// ---------------------------------------------------------------------------
// Gauge
// ---------------------------------------------------------------------------

/**
 * An arbitrary numeric value that can go up or down.
 */
export class Gauge {
  readonly name: string;
  readonly help: string;
  private readonly values = new Map<string, number>();

  constructor(name: string, help: string) {
    this.name = name;
    this.help = help;
  }

  set(value: number, labels: Readonly<Record<string, string>> = {}): void {
    this.values.set(labelsToKey(labels), value);
  }

  inc(labels: Readonly<Record<string, string>> = {}, amount = 1): void {
    const key = labelsToKey(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + amount);
  }

  dec(labels: Readonly<Record<string, string>> = {}, amount = 1): void {
    const key = labelsToKey(labels);
    this.values.set(key, (this.values.get(key) ?? 0) - amount);
  }

  get(labels: Readonly<Record<string, string>> = {}): number {
    return this.values.get(labelsToKey(labels)) ?? 0;
  }

  toPrometheusLines(): string[] {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} gauge`,
    ];
    if (this.values.size === 0) {
      lines.push(`${this.name} 0`);
      return lines;
    }
    for (const [key, value] of this.values) {
      const labelsStr = key.length > 0 ? `{${key}}` : '';
      lines.push(`${this.name}${labelsStr} ${formatValue(value)}`);
    }
    return lines;
  }
}

// ---------------------------------------------------------------------------
// Histogram
// ---------------------------------------------------------------------------

/**
 * Default bucket boundaries (seconds, matches standard Prometheus conventions).
 */
export const DEFAULT_BUCKETS: readonly number[] = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

interface HistogramSeries {
  buckets: Map<number, number>; // upper bound → cumulative count
  sum: number;
  count: number;
}

/**
 * Tracks observations across configurable buckets.
 * Each unique label set is a separate series.
 */
export class Histogram {
  readonly name: string;
  readonly help: string;
  private readonly bucketBounds: readonly number[];
  private readonly series = new Map<string, HistogramSeries>();

  constructor(
    name: string,
    help: string,
    buckets: readonly number[] = DEFAULT_BUCKETS,
  ) {
    this.name = name;
    this.help = help;
    // Sort ascending and ensure +Inf is always present
    this.bucketBounds = [...new Set([...buckets])].sort((a, b) => a - b);
  }

  observe(value: number, labels: Readonly<Record<string, string>> = {}): void {
    const key = labelsToKey(labels);
    let series = this.series.get(key);
    if (series === undefined) {
      const buckets = new Map<number, number>();
      for (const bound of this.bucketBounds) {
        buckets.set(bound, 0);
      }
      buckets.set(Infinity, 0);
      series = { buckets, sum: 0, count: 0 };
      this.series.set(key, series);
    }

    // Increment all buckets whose upper bound >= value
    for (const [bound] of series.buckets) {
      if (value <= bound) {
        series.buckets.set(bound, (series.buckets.get(bound) ?? 0) + 1);
      }
    }

    series.sum += value;
    series.count += 1;
  }

  get(labels: Readonly<Record<string, string>> = {}): HistogramSeries | undefined {
    return this.series.get(labelsToKey(labels));
  }

  toPrometheusLines(): string[] {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} histogram`,
    ];

    if (this.series.size === 0) {
      // Emit empty histogram with zero counts
      for (const bound of this.bucketBounds) {
        const boundStr = isFinite(bound) ? formatValue(bound) : '+Inf';
        lines.push(`${this.name}_bucket{le="${boundStr}"} 0`);
      }
      lines.push(`${this.name}_bucket{le="+Inf"} 0`);
      lines.push(`${this.name}_sum 0`);
      lines.push(`${this.name}_count 0`);
      return lines;
    }

    for (const [key, series] of this.series) {
      const baseLabels = key.length > 0 ? key + ',' : '';

      for (const [bound, count] of series.buckets) {
        const boundStr = isFinite(bound) ? formatValue(bound) : '+Inf';
        lines.push(
          `${this.name}_bucket{${baseLabels}le="${boundStr}"} ${formatValue(count)}`,
        );
      }
      const labelsStr = key.length > 0 ? `{${key}}` : '';
      lines.push(`${this.name}_sum${labelsStr} ${formatValue(series.sum)}`);
      lines.push(`${this.name}_count${labelsStr} ${formatValue(series.count)}`);
    }

    return lines;
  }
}

// ---------------------------------------------------------------------------
// MetricsRegistry
// ---------------------------------------------------------------------------

type AnyMetric = Counter | Gauge | Histogram;

/**
 * Singleton registry: register metrics and export to Prometheus text format.
 */
export class MetricsRegistry {
  private static _instance: MetricsRegistry | undefined;

  private readonly metrics = new Map<string, AnyMetric>();

  private constructor() {}

  static getInstance(): MetricsRegistry {
    if (MetricsRegistry._instance === undefined) {
      MetricsRegistry._instance = new MetricsRegistry();
    }
    return MetricsRegistry._instance;
  }

  /** Exposed for testing only — resets the singleton. */
  static _resetForTesting(): void {
    MetricsRegistry._instance = undefined;
  }

  register<T extends AnyMetric>(metric: T): T {
    if (this.metrics.has(metric.name)) {
      const existing = this.metrics.get(metric.name);
      if (existing !== metric) {
        throw new Error(
          `MetricsRegistry: metric "${metric.name}" is already registered with a different instance`,
        );
      }
      return existing as T;
    }
    this.metrics.set(metric.name, metric);
    return metric;
  }

  get<T extends AnyMetric>(name: string): T | undefined {
    return this.metrics.get(name) as T | undefined;
  }

  /** Export all registered metrics as Prometheus text format (exposition format). */
  toPrometheusText(): string {
    const lines: string[] = [];
    for (const metric of this.metrics.values()) {
      lines.push(...metric.toPrometheusLines());
      lines.push(''); // blank line separator between metric families
    }
    return lines.join('\n');
  }
}

// ---------------------------------------------------------------------------
// Module-level singleton and pre-defined metrics
// ---------------------------------------------------------------------------

export const metricsRegistry = MetricsRegistry.getInstance();

// --- Bot / Scene counts ---

export const botsTotal = metricsRegistry.register(
  new Gauge('lobster_engine_bots_total', 'Number of active bots'),
);

export const scenesTotal = metricsRegistry.register(
  new Gauge('lobster_engine_scenes_total', 'Number of active scenes'),
);

// --- Turn processing ---

export const turnsTotal = metricsRegistry.register(
  new Counter(
    'lobster_engine_turns_total',
    'Total number of turns processed, partitioned by scene_type and status',
  ),
);

export const turnDurationSeconds = metricsRegistry.register(
  new Histogram(
    'lobster_engine_turn_duration_seconds',
    'Turn processing duration in seconds',
    [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  ),
);

// --- AI adapter calls ---

export const aiRequestsTotal = metricsRegistry.register(
  new Counter(
    'lobster_engine_ai_requests_total',
    'Total number of AI adapter requests, partitioned by adapter and status',
  ),
);

export const aiDurationSeconds = metricsRegistry.register(
  new Histogram(
    'lobster_engine_ai_duration_seconds',
    'AI adapter call duration in seconds, partitioned by adapter',
    [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  ),
);

// --- Errors ---

export const errorsTotal = metricsRegistry.register(
  new Counter(
    'lobster_engine_errors_total',
    'Total number of errors, partitioned by type',
  ),
);

// --- Worker pool ---

export const workerActive = metricsRegistry.register(
  new Gauge('lobster_engine_worker_active', 'Number of currently active worker goroutines'),
);

// ---------------------------------------------------------------------------
// Convenience function
// ---------------------------------------------------------------------------

/** Return the full Prometheus exposition text for all registered metrics. */
export function getPrometheusText(): string {
  return metricsRegistry.toPrometheusText();
}

// ---------------------------------------------------------------------------
// Label helpers for callers (avoids raw string construction)
// ---------------------------------------------------------------------------

/** Build a labels object for `turnsTotal`. */
export function turnLabels(
  sceneType: string,
  status: 'success' | 'error',
): Readonly<Record<string, string>> {
  return { scene_type: sceneType, status };
}

/** Build a labels object for `aiRequestsTotal` / `aiDurationSeconds`. */
export function aiLabels(
  adapter: string,
  status?: 'success' | 'error',
): Readonly<Record<string, string>> {
  return status !== undefined ? { adapter, status } : { adapter };
}

/** Build a labels object for `errorsTotal`. */
export function errorLabels(type: string): Readonly<Record<string, string>> {
  return { type };
}

// Re-export label formatters for Prometheus text (used internally, exposed for testing)
export { labelsToPrometheus };
