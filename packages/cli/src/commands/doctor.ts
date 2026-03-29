// @lobster-engine/cli — doctor command

import pc from 'picocolors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DoctorOptions {
  readonly port?: string;
}

interface CheckResult {
  readonly label: string;
  readonly passed: boolean;
  readonly detail?: string;
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

function checkNodeVersion(): CheckResult {
  const raw = process.versions.node;
  const major = parseInt(raw.split('.')[0] ?? '0', 10);
  const passed = major >= 20;
  return {
    label: 'Node.js version',
    passed,
    detail: passed ? `v${raw}` : `v${raw} (need >= 20)`,
  };
}

async function checkGateway(port: number): Promise<CheckResult> {
  const url = `http://127.0.0.1:${port}/api/v1/status`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(3_000),
    });
    return {
      label: 'Gateway reachable',
      passed: response.ok,
      detail: response.ok ? `HTTP ${response.status} at ${url}` : `HTTP ${response.status}`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      label: 'Gateway reachable',
      passed: false,
      detail: msg,
    };
  }
}

async function checkNats(): Promise<CheckResult | null> {
  const natsUrl = process.env['NATS_URL'];
  if (natsUrl === undefined) return null;

  // Dynamic import so the CLI starts fast even when nats is not installed.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nats = await import('nats' as string) as any;
    const conn = await nats.connect({ servers: natsUrl, timeout: 3000 });
    await conn.drain();
    return { label: 'NATS connectivity', passed: true, detail: natsUrl };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { label: 'NATS connectivity', passed: false, detail: msg };
  }
}

async function checkRedis(): Promise<CheckResult | null> {
  const redisUrl = process.env['REDIS_URL'];
  if (redisUrl === undefined) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ioredis = await import('ioredis' as string) as any;
    const client = new ioredis.default(redisUrl, {
      connectTimeout: 3000,
      maxRetriesPerRequest: 0,
      lazyConnect: true,
    });
    await client.connect();
    await client.ping();
    await client.quit();
    return { label: 'Redis connectivity', passed: true, detail: redisUrl };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { label: 'Redis connectivity', passed: false, detail: msg };
  }
}

async function checkPostgres(): Promise<CheckResult | null> {
  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pg = await import('pg' as string) as any;
    const client = new pg.default.Client({ connectionString: dbUrl, connectionTimeoutMillis: 3000 });
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
    return { label: 'PostgreSQL connectivity', passed: true, detail: dbUrl };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { label: 'PostgreSQL connectivity', passed: false, detail: msg };
  }
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function printResult(result: CheckResult): void {
  const icon = result.passed ? pc.green('  PASS') : pc.red('  FAIL');
  const label = result.passed
    ? pc.white(result.label.padEnd(28))
    : pc.red(result.label.padEnd(28));

  const detail = result.detail !== undefined ? pc.dim(` ${result.detail}`) : '';
  process.stdout.write(`${icon}  ${label}${detail}\n`);
}

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------

export async function runDoctor(opts: DoctorOptions): Promise<void> {
  const port = opts.port !== undefined ? parseInt(opts.port, 10) : 3000;

  process.stdout.write('\n' + pc.bold('  Lobster Engine — System Doctor') + '\n');
  process.stdout.write(pc.dim('  ' + '─'.repeat(50)) + '\n\n');

  const results: CheckResult[] = [];

  // Synchronous checks first.
  results.push(checkNodeVersion());

  // Async checks in parallel to keep startup fast.
  const asyncChecks = await Promise.all([
    checkGateway(port),
    checkNats(),
    checkRedis(),
    checkPostgres(),
  ]);

  for (const check of asyncChecks) {
    if (check !== null) results.push(check);
  }

  for (const result of results) {
    printResult(result);
  }

  const failed = results.filter((r) => !r.passed);
  process.stdout.write('\n');

  if (failed.length === 0) {
    process.stdout.write(pc.green(pc.bold('  All checks passed.\n\n')));
  } else {
    process.stdout.write(
      pc.red(pc.bold(`  ${failed.length} check(s) failed.\n\n`)),
    );
    process.exit(1);
  }
}
