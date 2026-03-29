// @lobster-engine/cli — Startup banner

import pc from 'picocolors';

const ASCII_ART = `
 _      ___  ___  ___ _____ ___ ___       ___ _  _  ___ ___ _  _ ___
| |    / _ \\| _ )/ __|_   _| __| _ \\     | __| \\| |/ __|_ _| \\| | __|
| |__ | (_) | _ \\\\__ \\ | | | _||   /     | _|| .\` | (_ || || .\` | _|
|____|\\___/|___/|___/ |_| |___|_|_\\      |___|_|\\_|\\___|___|_|\\_|___|
`.trimStart();

export function printBanner(version: string, port: number, host: string): void {
  process.stdout.write(pc.red(ASCII_ART) + '\n');
  process.stdout.write(
    pc.bold('  Lobster Engine') +
      pc.dim(` v${version}`) +
      '  —  ' +
      pc.cyan(`http://${host}:${port}`) +
      '\n\n',
  );
}
