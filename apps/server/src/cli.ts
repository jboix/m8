/**
 * The command line: `--host` and `--port`, the way Vite takes them. They win
 * over `HOST` and `PORT`, so `bun run start --host 127.0.0.1` needs no
 * environment.
 */
import { networkInterfaces } from 'node:os';

/** Every interface: what a bare `--host` means, as it does for Vite. */
export const ALL_INTERFACES = '0.0.0.0';

/** Interfaces that containers create, which no other device can reach. */
const VIRTUAL = /^(docker|br-|veth|virbr)/;

/** What the command line set. Absent means it said nothing. */
export interface Flags {
  /** The address to listen on. */
  HOST?: string;
  /** The port to listen on. */
  PORT?: string;
}

/**
 * Split `--name=value` and `--name value` into a name and a value.
 *
 * @param args - The arguments, from the one being read on.
 * @returns The flag's name, its value or null when none follows, and how many
 * arguments it used.
 */
function readFlag(args: readonly string[]): { name: string; value: string | null; used: number } {
  const [first = '', next] = args;
  const equals = first.indexOf('=');
  if (equals > 0) return { name: first.slice(0, equals), value: first.slice(equals + 1), used: 1 };
  if (next !== undefined && !next.startsWith('--')) return { name: first, value: next, used: 2 };
  return { name: first, value: null, used: 1 };
}

/**
 * Read `--host` and `--port`.
 *
 * @param argv - The arguments after the script.
 * @returns What they set. A bare `--host` means every interface. Anything
 * else on the line is left alone.
 */
export function readFlags(argv: readonly string[]): Flags {
  const flags: Flags = {};
  for (let index = 0; index < argv.length; ) {
    const { name, value, used } = readFlag(argv.slice(index));
    if (name === '--host') flags.HOST = value ?? ALL_INTERFACES;
    if (name === '--port' && value !== null) flags.PORT = value;
    index += used;
  }
  return flags;
}

/**
 * The addresses other machines can reach the server on.
 *
 * @param host - The address it listens on.
 * @param port - The port.
 * @returns One URL per IPv4 network address when it listens on every
 * interface, nothing otherwise. Container bridges are left out: no other
 * device can reach them.
 */
export function networkUrls(host: string, port: number): string[] {
  if (host !== ALL_INTERFACES) return [];
  return Object.entries(networkInterfaces())
    .filter(([name]) => !VIRTUAL.test(name))
    .flatMap(([, addresses]) => addresses ?? [])
    .filter((address) => address.family === 'IPv4' && !address.internal)
    .map((address) => `http://${address.address}:${port}`);
}
