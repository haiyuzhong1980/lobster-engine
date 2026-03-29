// @lobster-engine/cli — unit tests
//
// Strategy: test each command module in isolation.  The CLI entry (cli.ts)
// is exercised via child_process.execFile so we verify real argument parsing
// without touching the live engine or gateway.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmpFile(name: string): string {
  return join(tmpdir(), `lobster-cli-test-${name}-${process.pid}`);
}

function cleanup(...paths: string[]): void {
  for (const p of paths) {
    try {
      if (existsSync(p)) unlinkSync(p);
    } catch {
      // best-effort
    }
  }
}

// Path to the compiled CLI binary (built by tsc).
const CLI_BIN = join(__dirname, '../../dist/cli.js');

async function runCli(...args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [CLI_BIN, ...args]);
    return { stdout, stderr, code: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      code: typeof e.code === 'number' ? e.code : 1,
    };
  }
}

// ---------------------------------------------------------------------------
// Version output
// ---------------------------------------------------------------------------

describe('version flag', () => {
  it('prints version that matches package.json', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require('../../package.json') as { version: string };
    const { stdout } = await runCli('--version');
    expect(stdout.trim()).toBe(pkg.version);
  });

  it('also works with -v short flag', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require('../../package.json') as { version: string };
    const { stdout } = await runCli('-v');
    expect(stdout.trim()).toBe(pkg.version);
  });
});

// ---------------------------------------------------------------------------
// stop command — PID file handling
// ---------------------------------------------------------------------------

describe('stop command', () => {
  it('exits non-zero when PID file is missing', async () => {
    const pidFile = tmpFile('stop-missing');
    cleanup(pidFile);

    const result = await runCli('stop', '--pid-file', pidFile);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/no pid file/i);
  });

  it('exits non-zero when PID in file is not alive', async () => {
    const pidFile = tmpFile('stop-dead');
    // PID 999999999 is virtually certain not to exist.
    writeFileSync(pidFile, '999999999', 'utf-8');
    try {
      const result = await runCli('stop', '--pid-file', pidFile);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toMatch(/not running|stale/i);
    } finally {
      cleanup(pidFile);
    }
  });

  it('sends SIGTERM and exits 0 for current process PID stored in file', async () => {
    // We spawn a long-running Node process, write its PID, then stop it.
    const { spawn } = await import('node:child_process');
    const child = spawn(process.execPath, ['-e', 'setTimeout(()=>{},60000)'], {
      detached: true,
      stdio: 'ignore',
    });

    const pid = child.pid;
    expect(pid).toBeDefined();

    const pidFile = tmpFile('stop-alive');
    writeFileSync(pidFile, String(pid), 'utf-8');

    try {
      const result = await runCli('stop', '--pid-file', pidFile);
      expect(result.code).toBe(0);
      expect(result.stdout).toMatch(/stopped/i);
    } finally {
      cleanup(pidFile);
      // Ensure child is gone even if the stop command failed.
      try { process.kill(pid!, 'SIGKILL'); } catch { /* already dead */ }
    }
  });
});

// ---------------------------------------------------------------------------
// status command — argument parsing
// ---------------------------------------------------------------------------

describe('status command', () => {
  it('fails gracefully when gateway is not running', async () => {
    // Port 19999 is almost certainly unused in CI.
    const result = await runCli('status', '--port', '19999');
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/could not connect|connect/i);
  });

  it('--json flag passes through and still fails on unreachable gateway', async () => {
    const result = await runCli('status', '--port', '19999', '--json');
    expect(result.code).not.toBe(0);
  });

  it('--verbose flag is accepted without errors when gateway is down', async () => {
    const result = await runCli('status', '--port', '19999', '--verbose');
    // We only check it does not throw an unhandled exception (no crash).
    expect(result.stderr).not.toMatch(/unhandled|typeerror/i);
  });
});

// ---------------------------------------------------------------------------
// doctor command — Node version check
// ---------------------------------------------------------------------------

describe('doctor command', () => {
  it('passes Node version check on Node >= 20', async () => {
    const major = parseInt(process.versions.node.split('.')[0] ?? '0', 10);
    const result = await runCli('doctor', '--port', '19999');

    if (major >= 20) {
      // Node check should always pass; gateway will fail (port unused).
      expect(result.stdout).toMatch(/pass.*node/i);
    } else {
      expect(result.stdout).toMatch(/fail.*node/i);
    }
  });
});

// ---------------------------------------------------------------------------
// config subcommands — unit-level (no subprocess needed)
// ---------------------------------------------------------------------------

describe('config init', () => {
  it('generates a valid JSON file with expected default keys', async () => {
    // Import the function directly (no subprocess) to avoid needing dist.
    const { initConfigFile } = await import('../config.js');
    const target = tmpFile('config-init.json');
    cleanup(target);

    try {
      initConfigFile(target);

      expect(existsSync(target)).toBe(true);

      const raw: unknown = JSON.parse(readFileSync(target, 'utf-8'));
      expect(typeof raw).toBe('object');
      expect(raw).not.toBeNull();

      const cfg = raw as Record<string, unknown>;
      expect(typeof cfg['port']).toBe('number');
      expect(typeof cfg['host']).toBe('string');
      expect(typeof cfg['storage']).toBe('string');
      expect(typeof cfg['logLevel']).toBe('string');
    } finally {
      cleanup(target);
    }
  });

  it('generates the file via CLI subprocess', async () => {
    const dir = join(tmpdir(), `lobster-cli-test-configinit-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    const target = join(dir, 'lobster-engine.config.json');
    cleanup(target);

    try {
      const result = await runCli('config', 'init', '--config', target);
      expect(result.code).toBe(0);
      expect(result.stdout).toMatch(/created/i);
      expect(existsSync(target)).toBe(true);

      const content: unknown = JSON.parse(readFileSync(target, 'utf-8'));
      expect(typeof content).toBe('object');
    } finally {
      cleanup(target);
    }
  });
});

describe('config set', () => {
  it('writes the key to the config file', async () => {
    const target = tmpFile('config-set.json');
    cleanup(target);

    try {
      const result = await runCli('config', 'set', 'port', '4000', '--config', target);
      expect(result.code).toBe(0);

      const raw: unknown = JSON.parse(readFileSync(target, 'utf-8'));
      expect((raw as Record<string, unknown>)['port']).toBe('4000');
    } finally {
      cleanup(target);
    }
  });
});

describe('config show', () => {
  it('prints keys when config file exists', async () => {
    const target = tmpFile('config-show.json');
    writeFileSync(target, JSON.stringify({ port: 8080, host: 'localhost' }), 'utf-8');

    try {
      const result = await runCli('config', 'show', '--config', target);
      expect(result.code).toBe(0);
      expect(result.stdout).toMatch(/port/);
      expect(result.stdout).toMatch(/host/);
    } finally {
      cleanup(target);
    }
  });

  it('shows helpful message when no config file found', async () => {
    const target = tmpFile('config-show-missing.json');
    cleanup(target);

    const result = await runCli('config', 'show', '--config', target);
    // Exit 0 — missing config is a normal state.
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/no config|defaults/i);
  });
});

// ---------------------------------------------------------------------------
// Argument parsing — start command options accepted
// ---------------------------------------------------------------------------

describe('start command option parsing', () => {
  it('does not crash when --help is passed', async () => {
    const result = await runCli('start', '--help');
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/--port/);
    expect(result.stdout).toMatch(/--host/);
    expect(result.stdout).toMatch(/--storage/);
  });
});
