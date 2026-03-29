// @lobster-engine/cli — status command

import pc from 'picocolors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StatusOptions {
  readonly port?: string;
  readonly json?: boolean;
  readonly verbose?: boolean;
}

interface AdapterInfo {
  readonly name: string;
  readonly type: string;
  readonly status: string;
}

interface EngineStatus {
  readonly state: string;
  readonly version?: string;
  readonly uptime?: number;
  readonly activeBots?: number;
  readonly activeScenes?: number;
  readonly storage?: string;
  readonly adapters?: AdapterInfo[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function printTable(status: EngineStatus, verbose: boolean): void {
  const stateColor =
    status.state === 'running' ? pc.green(status.state)
    : status.state === 'starting' ? pc.yellow(status.state)
    : pc.red(status.state ?? 'unknown');

  const col = (label: string): string => pc.dim(`  ${label.padEnd(16)}: `);

  process.stdout.write('\n' + pc.bold('  Lobster Engine Status') + '\n');
  process.stdout.write(pc.dim('  ' + '─'.repeat(40)) + '\n');
  process.stdout.write(col('State') + stateColor + '\n');

  if (status.version !== undefined) {
    process.stdout.write(col('Version') + pc.cyan(status.version) + '\n');
  }

  if (status.uptime !== undefined) {
    process.stdout.write(col('Uptime') + pc.yellow(formatUptime(status.uptime)) + '\n');
  }

  process.stdout.write(
    col('Active Bots') + pc.white(String(status.activeBots ?? 0)) + '\n',
  );
  process.stdout.write(
    col('Active Scenes') + pc.white(String(status.activeScenes ?? 0)) + '\n',
  );

  if (status.storage !== undefined) {
    process.stdout.write(col('Storage') + pc.yellow(status.storage) + '\n');
  }

  if (verbose && status.adapters !== undefined && status.adapters.length > 0) {
    process.stdout.write('\n' + pc.bold('  Adapters') + '\n');
    process.stdout.write(pc.dim('  ' + '─'.repeat(40)) + '\n');

    for (const adapter of status.adapters) {
      const adapterStateColor =
        adapter.status === 'connected' ? pc.green(adapter.status)
        : adapter.status === 'connecting' ? pc.yellow(adapter.status)
        : pc.red(adapter.status);

      process.stdout.write(
        pc.dim(`  ${adapter.name.padEnd(20)}`) +
          pc.cyan(adapter.type.padEnd(16)) +
          adapterStateColor +
          '\n',
      );
    }
  }

  process.stdout.write('\n');
}

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------

export async function runStatus(opts: StatusOptions): Promise<void> {
  const port = opts.port !== undefined ? parseInt(opts.port, 10) : 3000;

  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    process.stderr.write(pc.red(`Invalid port: ${opts.port ?? ''}\n`));
    process.exit(1);
  }

  const url = `http://127.0.0.1:${port}/api/v1/status`;

  let rawData: unknown;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      process.stderr.write(
        pc.red(`Gateway returned HTTP ${response.status} from ${url}\n`),
      );
      process.exit(1);
    }

    rawData = await response.json();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      pc.red('Could not connect to gateway at ') +
        pc.bold(url) +
        pc.red('.\n') +
        pc.dim(`  ${msg}\n`) +
        pc.dim('  Is the engine running? Try: lobster-engine start\n'),
    );
    process.exit(1);
  }

  if (opts.json === true) {
    process.stdout.write(JSON.stringify(rawData, null, 2) + '\n');
    return;
  }

  // Normalise into our view type.
  const raw =
    typeof rawData === 'object' && rawData !== null && !Array.isArray(rawData)
      ? (rawData as Record<string, unknown>)
      : {};

  const status: EngineStatus = {
    state: typeof raw['state'] === 'string' ? raw['state'] : 'unknown',
    version: typeof raw['version'] === 'string' ? raw['version'] : undefined,
    uptime: typeof raw['uptime'] === 'number' ? raw['uptime'] : undefined,
    activeBots: typeof raw['activeBots'] === 'number' ? raw['activeBots'] : undefined,
    activeScenes: typeof raw['activeScenes'] === 'number' ? raw['activeScenes'] : undefined,
    storage: typeof raw['storage'] === 'string' ? raw['storage'] : undefined,
    adapters: Array.isArray(raw['adapters'])
      ? (raw['adapters'] as unknown[]).flatMap((a) => {
          if (typeof a !== 'object' || a === null) return [];
          const entry = a as Record<string, unknown>;
          return [{
            name: typeof entry['name'] === 'string' ? entry['name'] : 'unknown',
            type: typeof entry['type'] === 'string' ? entry['type'] : 'unknown',
            status: typeof entry['status'] === 'string' ? entry['status'] : 'unknown',
          }];
        })
      : undefined,
  };

  printTable(status, opts.verbose === true);
}
