// @lobster-engine/cli — stop command

import pc from 'picocolors';
import { readPid, removePid, isPidAlive, DEFAULT_PID_FILE } from '../pid.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StopOptions {
  readonly pidFile?: string;
}

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------

export async function runStop(opts: StopOptions): Promise<void> {
  const pidFile = opts.pidFile ?? DEFAULT_PID_FILE;
  const pid = readPid(pidFile);

  if (pid === undefined) {
    process.stderr.write(
      pc.yellow('No PID file found at ') + pc.yellow(pc.bold(pidFile)) + '\n' +
      pc.dim('Is the engine running?\n'),
    );
    process.exit(1);
  }

  if (!isPidAlive(pid)) {
    process.stderr.write(
      pc.yellow(`Process ${pid} is not running. Cleaning up stale PID file.\n`),
    );
    removePid(pidFile);
    process.exit(1);
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(pc.red(`Failed to send SIGTERM to process ${pid}: ${msg}\n`));
    process.exit(1);
  }

  // Wait up to 5 seconds for the process to exit, then clean up if needed.
  const POLL_INTERVAL_MS = 200;
  const MAX_WAIT_MS = 5_000;
  let elapsed = 0;

  await new Promise<void>((resolve) => {
    const poll = (): void => {
      if (!isPidAlive(pid)) {
        resolve();
        return;
      }
      elapsed += POLL_INTERVAL_MS;
      if (elapsed >= MAX_WAIT_MS) {
        resolve();
        return;
      }
      setTimeout(poll, POLL_INTERVAL_MS);
    };
    setTimeout(poll, POLL_INTERVAL_MS);
  });

  if (isPidAlive(pid)) {
    process.stderr.write(
      pc.yellow(`Process ${pid} did not exit within ${MAX_WAIT_MS / 1000}s.\n`) +
      pc.dim('You may need to kill it manually.\n'),
    );
    process.exit(1);
  }

  removePid(pidFile);
  process.stdout.write(pc.green(`Stopped process ${pid} successfully.\n`));
}
