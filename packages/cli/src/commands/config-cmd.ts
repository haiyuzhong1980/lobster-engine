// @lobster-engine/cli — config subcommand

import pc from 'picocolors';
import {
  loadRawConfig,
  saveConfigValue,
  initConfigFile,
  DEFAULT_CONFIG_PATH,
} from '../config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConfigShowOptions {
  readonly config?: string;
}

export interface ConfigSetOptions {
  readonly config?: string;
}

export interface ConfigInitOptions {
  readonly config?: string;
}

// ---------------------------------------------------------------------------
// config show
// ---------------------------------------------------------------------------

export function runConfigShow(opts: ConfigShowOptions): void {
  const raw = loadRawConfig(opts.config);
  const keys = Object.keys(raw);

  if (keys.length === 0) {
    process.stdout.write(pc.dim('  No config file found. Using defaults.\n'));
    process.stdout.write(
      pc.dim('  Run ') +
        pc.cyan('lobster-engine config init') +
        pc.dim(' to create one.\n'),
    );
    return;
  }

  process.stdout.write('\n' + pc.bold('  Current Configuration') + '\n');
  process.stdout.write(pc.dim('  ' + '─'.repeat(40)) + '\n');

  for (const key of keys) {
    const value = raw[key];
    const displayValue = value === undefined || value === null ? pc.dim('(unset)') : pc.yellow(String(value));
    process.stdout.write(pc.dim(`  ${key.padEnd(20)}: `) + displayValue + '\n');
  }

  process.stdout.write('\n');
}

// ---------------------------------------------------------------------------
// config set
// ---------------------------------------------------------------------------

export function runConfigSet(key: string, value: string, opts: ConfigSetOptions): void {
  if (key.trim() === '') {
    process.stderr.write(pc.red('Key must not be empty.\n'));
    process.exit(1);
  }

  const target = opts.config ?? DEFAULT_CONFIG_PATH;

  try {
    saveConfigValue(key, value, target);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(pc.red(`Failed to write config: ${msg}\n`));
    process.exit(1);
  }

  process.stdout.write(
    pc.green('  Set ') +
      pc.bold(key) +
      pc.green(' = ') +
      pc.yellow(value) +
      pc.dim(` in ${target}`) +
      '\n',
  );
}

// ---------------------------------------------------------------------------
// config init
// ---------------------------------------------------------------------------

export function runConfigInit(opts: ConfigInitOptions): void {
  const target = opts.config ?? DEFAULT_CONFIG_PATH;

  try {
    initConfigFile(target);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(pc.red(`Failed to create config file: ${msg}\n`));
    process.exit(1);
  }

  process.stdout.write(
    pc.green('  Created config file at ') + pc.bold(target) + '\n',
  );
}

// ---------------------------------------------------------------------------
// Aggregated entry point — wired by cli.ts
// ---------------------------------------------------------------------------

export function registerConfigCommand(
  program: import('commander').Command,
): void {
  const configCmd = program
    .command('config')
    .description('Manage lobster-engine configuration');

  configCmd
    .command('show')
    .description('Print resolved configuration from file + environment')
    .option('-c, --config <path>', 'Config file path')
    .action((opts: ConfigShowOptions) => runConfigShow(opts));

  configCmd
    .command('set <key> <value>')
    .description('Set a configuration key in the local config file')
    .option('-c, --config <path>', 'Config file path')
    .action((key: string, value: string, opts: ConfigSetOptions) =>
      runConfigSet(key, value, opts),
    );

  configCmd
    .command('init')
    .description('Generate a default lobster-engine.config.json in the current directory')
    .option('-c, --config <path>', 'Config file path to create')
    .action((opts: ConfigInitOptions) => runConfigInit(opts));
}
