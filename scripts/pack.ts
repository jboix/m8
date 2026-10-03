/**
 * Builds the npm package `@jboix/m8` in `out/package` and packs it into a
 * tarball in `out/`. The package is the server bundled into one file, the web
 * build without its source maps, the `m8` launcher, and the README, the licence
 * and the third-party notes. Run it with `bun run pack`; publishing is separate.
 */
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';

/** Where the package is assembled. */
const OUT = 'out/package';

/**
 * The version the package carries: the root `package.json`'s, which a release
 * sets before it packs. `M8_VERSION` overrides it for a test.
 */
const VERSION: string = process.env.M8_VERSION ?? (await Bun.file('package.json').json()).version;

/** The package's manifest. It has no dependencies: everything is in the bundle. */
const MANIFEST = {
  name: '@jboix/m8',
  version: VERSION,
  description:
    'A pair of eyes in a browser tab that sees, hears and talks through Gemini Live, and remembers you.',
  keywords: ['gemini-live', 'voice-ai', 'ai-companion', 'computer-vision', 'mediapipe', 'bun'],
  license: 'MIT',
  author: 'Josep Boix Requesens',
  homepage: 'https://github.com/jboix/m8#readme',
  repository: { type: 'git', url: 'git+https://github.com/jboix/m8.git' },
  bugs: { url: 'https://github.com/jboix/m8/issues' },
  type: 'module',
  bin: { m8: 'm8.mjs' },
  engines: { bun: '>=1.4' },
  // A scoped package is private unless it says otherwise. The registry is named
  // under the scope's own key, because npm lets an .npmrc that maps `@jboix`
  // elsewhere win over a plain `registry`.
  // No `provenance` here: trusted publishing adds it in CI, and a manual
  // publish from a laptop cannot make it.
  publishConfig: {
    access: 'public',
    registry: 'https://registry.npmjs.org/',
    '@jboix:registry': 'https://registry.npmjs.org/',
  },
};

/**
 * Delete every source map under a folder.
 *
 * @param dir - The folder.
 */
async function dropSourceMaps(dir: string): Promise<void> {
  for (const entry of await readdir(dir, { recursive: true })) {
    if (entry.endsWith('.map')) await rm(join(dir, entry));
  }
}

/**
 * Bundle the server into one file. Bun's own modules stay outside it.
 *
 * @throws {Error} When the bundle fails, with Bun's messages.
 */
async function bundleServer(): Promise<void> {
  const built = await Bun.build({
    entrypoints: ['apps/server/src/index.ts'],
    outdir: OUT,
    naming: 'server.js',
    target: 'bun',
  });
  if (!built.success) throw new Error(built.logs.map(String).join('\n'));
}

/**
 * The size of a file, in megabytes.
 *
 * @param path - The file.
 * @returns Its size, rounded to a tenth.
 */
async function megabytes(path: string): Promise<string> {
  return ((await stat(path)).size / 1_048_576).toFixed(1);
}

await rm(OUT, { recursive: true, force: true });
await mkdir(join(OUT, 'docs'), { recursive: true });
await $`bun run build`.quiet();
await bundleServer();
await cp('apps/web/dist', join(OUT, 'web'), { recursive: true });
await dropSourceMaps(join(OUT, 'web'));
await cp('scripts/package/m8.mjs', join(OUT, 'm8.mjs'));
await cp('README.md', join(OUT, 'README.md'));
await cp('LICENSE', join(OUT, 'LICENSE'));
await cp('docs/third-party.md', join(OUT, 'docs/third-party.md'));
await Bun.write(join(OUT, 'package.json'), `${JSON.stringify(MANIFEST, null, 2)}\n`);
const tarball = (await $`bun pm pack --destination .. --quiet`.cwd(OUT).text()).trim();
const packed = join('out', tarball.split('/').at(-1) ?? tarball);
console.info(`${packed}: ${await megabytes(packed)} MB`);
