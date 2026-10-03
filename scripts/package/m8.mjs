#!/usr/bin/env node
/**
 * The `m8` command in the npm package. It starts the bundled server with Bun,
 * keeps the memory and the keys in a folder of the person's own, and opens the
 * browser on request. It runs under Node or Bun, so `npx` can say clearly that
 * Bun is missing instead of failing on the shebang.
 */
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The package folder: the bundle, the web build and this file. */
const HERE = dirname(fileURLToPath(import.meta.url));

/** The oldest Bun the server runs on. */
const MIN_BUN = [1, 4];

/** What `--help` prints. */
const HELP = `m8: a pair of eyes in a browser tab that sees, hears and talks.

Usage: m8 [--port 3001] [--host 0.0.0.0] [--data ~/.m8] [--open]

  --port <n>     the port to listen on (or PORT)
  --host [addr]  the address to listen on; every interface by default
  --data <dir>   where his memory and keys live (or M8_HOME); ~/.m8 by default
  --open         open the page in the browser once the server is up
  --version      print the version
  --help         print this help

Open the address it prints, give it your Gemini API key, and wake him up.`;

/** The launcher's yes or no options, by every way to write them. */
const SWITCHES = {
  '--open': 'open',
  '--help': 'help',
  '-h': 'help',
  '--version': 'version',
  '-v': 'version',
};

/**
 * Read this launcher's own options and keep the rest for the server.
 *
 * @param {string[]} argv - The arguments after the command.
 * @returns {{ data?: string, open: boolean, help: boolean, version: boolean, rest: string[] }}
 * The launcher's options, and the arguments to pass on.
 */
function readArgs(argv) {
  const args = { open: false, help: false, version: false, rest: [] };
  const queue = argv.flatMap((arg) =>
    arg.startsWith('--data=') ? ['--data', arg.slice(7)] : [arg],
  );
  while (queue.length > 0) {
    const arg = queue.shift() ?? '';
    if (SWITCHES[arg]) args[SWITCHES[arg]] = true;
    else if (arg === '--data') args.data = queue.shift();
    else args.rest.push(arg);
  }
  return args;
}

/**
 * The port the server will listen on, as it will read it.
 *
 * @param {string[]} rest - The arguments passed on to the server.
 * @returns {number} The port from `--port`, then `PORT`, then 3001.
 */
function portOf(rest) {
  const flag = rest.findIndex((arg) => arg === '--port' || arg.startsWith('--port='));
  const value =
    flag < 0 ? undefined : rest[flag].includes('=') ? rest[flag].split('=')[1] : rest[flag + 1];
  return Number(value ?? process.env.PORT ?? 3001);
}

/**
 * Find Bun, and check it is new enough.
 *
 * @returns {string | null} The Bun to run the server with, or null after
 * saying why there is none.
 */
function findBun() {
  const bun = process.versions.bun ? process.execPath : 'bun';
  const found = spawnSync(bun, ['--version'], { encoding: 'utf8' });
  if (found.error || found.status !== 0) {
    console.error(
      'm8 runs on Bun, and Bun was not found. Install it from https://bun.sh, then run m8 again.',
    );
    return null;
  }
  const [major = 0, minor = 0] = found.stdout.trim().split('.').map(Number);
  if (major < MIN_BUN[0] || (major === MIN_BUN[0] && minor < MIN_BUN[1])) {
    console.error(
      `m8 needs Bun ${MIN_BUN.join('.')} or later, and this is ${found.stdout.trim()}. Run bun upgrade.`,
    );
    return null;
  }
  return bun;
}

/**
 * Open a page in the person's browser. A failure is only reported.
 *
 * @param {string} url - The page.
 */
function openBrowser(url) {
  const [command, ...args] =
    platform() === 'darwin'
      ? ['open', url]
      : platform() === 'win32'
        ? ['cmd', '/c', 'start', '', url]
        : ['xdg-open', url];
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.on('error', () => console.warn(`Open ${url} in your browser.`));
  child.unref();
}

/**
 * Wait for the server to answer, then open the page.
 *
 * @param {number} port - Where it listens.
 */
async function openWhenUp(port) {
  for (let tries = 0; tries < 80; tries++) {
    const up = await fetch(`http://127.0.0.1:${port}/health`).then(
      (response) => response.ok,
      () => false,
    );
    if (up) return openBrowser(`http://localhost:${port}`);
    await new Promise((done) => setTimeout(done, 250));
  }
}

/**
 * Start the server, and stop with it.
 *
 * @param {string} bun - The Bun to run it with.
 * @param {ReturnType<typeof readArgs>} args - The options.
 */
function start(bun, args) {
  const home = resolve(args.data ?? process.env.M8_HOME ?? join(homedir(), '.m8'));
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    WEB_DIST: join(HERE, 'web'),
    MEMORY_DB_PATH: process.env.MEMORY_DB_PATH ?? join(home, 'memory', 'm8.sqlite'),
    M8_KEYS_DIR: process.env.M8_KEYS_DIR ?? join(home, 'keys'),
  };
  console.warn(`m8 keeps his memory and keys in ${home}`);
  const server = spawn(bun, [join(HERE, 'server.js'), ...args.rest], { stdio: 'inherit', env });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
  server.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
  if (args.open) void openWhenUp(portOf(args.rest));
}

const args = readArgs(process.argv.slice(2));
if (args.help) console.warn(HELP);
else if (args.version)
  console.warn(JSON.parse(readFileSync(join(HERE, 'package.json'), 'utf8')).version);
else {
  const bun = findBun();
  if (bun) start(bun, args);
  else process.exitCode = 1;
}
