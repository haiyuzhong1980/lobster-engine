// @lobster-engine/cli — PID file helpers

import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_PID_FILE = join(tmpdir(), 'lobster-engine.pid');

export function writePid(pidFile: string = DEFAULT_PID_FILE): void {
  writeFileSync(pidFile, String(process.pid), 'utf-8');
}

export function readPid(pidFile: string = DEFAULT_PID_FILE): number | undefined {
  if (!existsSync(pidFile)) return undefined;
  const raw = readFileSync(pidFile, 'utf-8').trim();
  const pid = parseInt(raw, 10);
  return Number.isFinite(pid) && pid > 0 ? pid : undefined;
}

export function removePid(pidFile: string = DEFAULT_PID_FILE): void {
  if (existsSync(pidFile)) {
    unlinkSync(pidFile);
  }
}

/**
 * Returns true when a process with the given PID is currently alive.
 * On POSIX systems, `kill(pid, 0)` tests for process existence without
 * sending a signal. On Windows we use a best-effort approach.
 */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
