#!/usr/bin/env node
// @lobster-engine/cli — Entry point

import { Command } from 'commander';
import { runStart } from './commands/start.js';
import { runStop } from './commands/stop.js';
import { runStatus } from './commands/status.js';
import { runDoctor } from './commands/doctor.js';
import { registerConfigCommand } from './commands/config-cmd.js';

// ---------------------------------------------------------------------------
// Package version
// ---------------------------------------------------------------------------

function getVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require('../package.json') as { version?: string };
    return typeof pkg.version === 'string' ? pkg.version : '0.1.0';
  } catch {
    return '0.1.0';
  }
}

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name('lobster-engine')
  .description('Lobster Engine — Pluggable AI Bot Runtime')
  .version(getVersion(), '-v, --version', 'Print version number');

// --- start ---
program
  .command('start')
  .description('Start the engine and gateway')
  .option('-p, --port <port>', 'Gateway port', '3000')
  .option('-H, --host <host>', 'Gateway host', '0.0.0.0')
  .option('-s, --storage <type>', 'Storage backend (memory|sqlite|redis|postgres)', 'memory')
  .option('-c, --config <path>', 'Config file path')
  .option('--pid-file <path>', 'PID file path')
  .action(runStart);

// --- stop ---
program
  .command('stop')
  .description('Stop a running engine process via SIGTERM')
  .option('--pid-file <path>', 'PID file path (override default)')
  .action(runStop);

// --- status ---
program
  .command('status')
  .description('Show engine status from the running gateway')
  .option('-p, --port <port>', 'Gateway port', '3000')
  .option('--json', 'Output raw JSON response')
  .option('--verbose', 'Include adapter details')
  .action(runStatus);

// --- doctor ---
program
  .command('doctor')
  .description('Run system health checks (Node, gateway, NATS, Redis, PostgreSQL)')
  .option('-p, --port <port>', 'Gateway port to probe', '3000')
  .action(runDoctor);

// --- config (subcommands registered by helper) ---
registerConfigCommand(program);

program.parse();
