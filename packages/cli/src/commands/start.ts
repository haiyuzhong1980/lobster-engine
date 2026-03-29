// @lobster-engine/cli — start command

import pc from 'picocolors';

// ora is ESM-only — dynamic import required under Node16 module resolution.
interface Spinner {
  start(): Spinner;
  succeed(text: string): void;
  fail(text: string): void;
  text: string;
}

async function createSpinner(text: string, color = 'cyan'): Promise<Spinner> {
  // ora is ESM-only; use dynamic import to load it from CJS context.
  const { default: ora } = await (eval('import("ora")') as Promise<{ default: (opts: { text: string; color: string }) => Spinner }>);
  return ora({ text, color });
}
import { createServer } from '@lobster-engine/gateway';
import { LobsterEngine, MemoryProvider } from '@lobster-engine/core';
import { printBanner } from '../banner.js';
import { resolveConfig, type StartOptions } from '../config.js';
import { writePid, removePid } from '../pid.js';

// ---------------------------------------------------------------------------
// Package version — resolved at build time via resolveJsonModule
// ---------------------------------------------------------------------------

// We read the version from the nearest package.json at runtime to avoid
// hard-coding it. The import is kept as a string literal for static analysis.
function getVersion(): string {
  try {
    // Dynamic approach that works with module:Node16 and composite builds.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require('../../package.json') as { version?: string };
    return typeof pkg.version === 'string' ? pkg.version : '0.0.1';
  } catch {
    return '0.0.1';
  }
}

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------

export async function runStart(opts: StartOptions): Promise<void> {
  const config = resolveConfig(opts);
  const version = getVersion();

  const spinner = (await createSpinner(pc.dim('Initializing engine...'))).start();

  try {
    // --- Storage ---
    spinner.text = pc.dim(`Connecting storage (${config.storage})...`);
    const storage = createStorage(config.storage);

    // --- Engine ---
    spinner.text = pc.dim('Starting LobsterEngine...');
    const engine = new LobsterEngine({
      name: 'lobster-engine',
      version,
      storage,
    });
    await engine.start();

    // --- Gateway ---
    spinner.text = pc.dim(`Starting gateway on ${config.host}:${config.port}...`);
    const gateway = createServer({ port: config.port, host: config.host });
    await gateway.start();

    spinner.succeed(pc.green('Lobster Engine started'));

    // --- Write PID ---
    writePid(config.pidFile);

    // --- Banner ---
    printBanner(version, config.port, config.host);

    process.stdout.write(
      pc.dim('  Storage  : ') + pc.yellow(config.storage) + '\n' +
      pc.dim('  PID file : ') + pc.yellow(config.pidFile) + '\n' +
      pc.dim('  PID      : ') + pc.yellow(String(process.pid)) + '\n\n' +
      pc.dim('  Press Ctrl+C to stop.\n\n'),
    );

    // --- Graceful shutdown ---
    const shutdown = async (): Promise<void> => {
      const stopSpinner = (await createSpinner(pc.dim('Shutting down...'))).start();
      try {
        await gateway.stop();
        await engine.stop();
        removePid(config.pidFile);
        stopSpinner.succeed(pc.green('Stopped cleanly'));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        stopSpinner.fail(pc.red(`Shutdown error: ${msg}`));
      } finally {
        process.exit(0);
      }
    };

    process.once('SIGINT', () => { void shutdown(); });
    process.once('SIGTERM', () => { void shutdown(); });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    spinner.fail(pc.red(`Failed to start: ${msg}`));
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Storage factory
// ---------------------------------------------------------------------------

function createStorage(type: string): MemoryProvider {
  // Currently only memory is bundled in core.
  // sqlite / redis / postgres would require importing their respective packages.
  // The CLI prints a clear message when an unsupported backend is requested.
  switch (type) {
    case 'memory':
      return new MemoryProvider();
    case 'sqlite':
    case 'redis':
    case 'postgres':
      process.stderr.write(
        pc.yellow(`Warning: storage backend "${type}" requires an optional package. `) +
        pc.yellow('Falling back to memory.\n'),
      );
      return new MemoryProvider();
    default:
      process.stderr.write(
        pc.yellow(`Unknown storage type "${type}". Falling back to memory.\n`),
      );
      return new MemoryProvider();
  }
}
