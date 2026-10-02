/**
 * Puts everything the workers need into `public/`, where Vite serves it
 * untouched: tier 1 vision, and the ambient sound classifier.
 *
 * MediaPipe loads its wasm runtime with `importScripts`, which only works in a
 * classic worker. Vite's dev server always serves workers as modules, where
 * `importScripts` exists but throws; MediaPipe then falls back to `import()`,
 * and the emscripten loader is not valid as an ES module. Every one of those
 * paths ends at the same unhelpful "ModuleFactory not set".
 *
 * So the worker is bundled here as a classic script and served as a static
 * asset, which is a shape both dev and production agree on. The wasm goes the
 * same way: imported with `?url` it passes through Vite's transform, and the
 * transformed loader never sets the global MediaPipe looks for.
 *
 * Run by the `dev` and `build` scripts. Nothing it writes is in git.
 *
 * The cost: the workers do not hot reload. Re-run `bun run vendor` after
 * changing anything under `senses/vision` or `senses/audio` that one of them
 * imports.
 */
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** This package's root. */
const APP_DIR = dirname(import.meta.dir);

/** A file copied out of an installed package, resolved through its exports map. */
interface PackageFile {
  /** The package. */
  pkg: string;
  /** The file, as the package exports it. */
  name: string;
}

/** A file fetched from the web. Checked by size, and not fetched again once it is there. */
interface Download {
  /** Where it lives. */
  url: string;
  /** What to call it under `out`. */
  name: string;
  /** How many bytes it is. Anything else is a bad download. */
  bytes: number;
}

/** One worker and the runtime it needs. */
interface Bundle {
  /** The folder under `public/`, which is also the URL prefix. */
  out: string;
  /**
   * The wasm runtimes. MediaPipe's SIMD build is two files, and each package
   * names its own after the task family it runs. The nosimd and threaded
   * builds are unused.
   */
  wasm: PackageFile[];
  /** Models served from here rather than from a CDN. */
  downloads: Download[];
  /** The worker's source, relative to the package root. */
  entry: string;
  /** What the bundle is called under `out`. */
  file: string;
}

/**
 * The face recognition model: FaceX's nano MobileFaceNet, Apache 2.0, trained
 * from scratch on MS1M-RefineV2. 0.8 MB, a 256-value embedding, 95.6% on LFW.
 * Its input is an ArcFace-aligned 112 by 112 RGB crop, scaled to -1 to 1.
 */
const FACE_MODEL: Download = {
  url: 'https://github.com/facex-engine/facex/releases/download/facex-nano-1.0/facex_nano.onnx',
  name: 'facex_nano.onnx',
  bytes: 802_377,
};

/** Both of them. Adding a third sense means adding a row here. */
const BUNDLES: Bundle[] = [
  {
    out: 'vision',
    wasm: [
      { pkg: '@mediapipe/tasks-vision', name: 'vision_wasm_internal.js' },
      { pkg: '@mediapipe/tasks-vision', name: 'vision_wasm_internal.wasm' },
      // The recogniser's runtime. Its loader is bundled into the worker, so
      // only the binary is served.
      { pkg: 'onnxruntime-web', name: 'ort-wasm-simd-threaded.wasm' },
    ],
    downloads: [FACE_MODEL],
    entry: 'src/senses/vision/vision.worker.ts',
    file: 'vision.worker.js',
  },
  {
    out: 'hearing',
    wasm: [
      { pkg: '@mediapipe/tasks-audio', name: 'audio_wasm_internal.js' },
      { pkg: '@mediapipe/tasks-audio', name: 'audio_wasm_internal.wasm' },
    ],
    downloads: [],
    entry: 'src/senses/audio/ambient.worker.ts',
    file: 'ambient.worker.js',
  },
];

/**
 * Copy one wasm file, resolved through the package's own exports map.
 *
 * @param bundle - Which worker it belongs to.
 * @param file - The file to copy.
 * @returns How many bytes it wrote.
 * @throws {Error} When the package is not installed.
 */
async function copyWasm(bundle: Bundle, file: PackageFile): Promise<number> {
  const source = Bun.file(Bun.resolveSync(`${file.pkg}/${file.name}`, APP_DIR));
  if (!(await source.exists())) throw new Error(`${file.pkg} is missing ${file.name}`);
  return Bun.write(join(APP_DIR, 'public', bundle.out, file.name), source);
}

/**
 * Fetch one model, unless a copy of the right size is already there.
 *
 * @param bundle - Which worker it belongs to.
 * @param download - What to fetch.
 * @returns How many bytes are in place.
 * @throws {Error} When the download fails or is not the size it should be.
 */
async function fetchModel(bundle: Bundle, download: Download): Promise<number> {
  const target = Bun.file(join(APP_DIR, 'public', bundle.out, download.name));
  if ((await target.exists()) && target.size === download.bytes) return download.bytes;
  const response = await fetch(download.url);
  if (!response.ok) throw new Error(`${download.url} answered ${response.status}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== download.bytes) {
    throw new Error(`${download.name} is ${bytes.byteLength} bytes, expected ${download.bytes}`);
  }
  return Bun.write(target, bytes);
}

/**
 * Bundle one worker as a classic script.
 *
 * @param bundle - Which worker to build.
 * @returns How many bytes it wrote.
 * @throws {Error} When the bundle fails, with the reasons.
 */
async function buildWorker(bundle: Bundle): Promise<number> {
  const built = await Bun.build({
    entrypoints: [join(APP_DIR, bundle.entry)],
    target: 'browser',
    format: 'iife',
    minify: true,
    // The ONNX runtime locates itself with `import.meta.url`, which a classic
    // script cannot even parse; in a worker that URL is its location. It also
    // probes for `require`, and the bundler turns the probe into a helper it
    // then leaves out. There is no `require` here, so say so.
    define: { 'import.meta.url': 'self.location.href', require: 'undefined' },
  });
  if (!built.success) throw new Error(built.logs.map(String).join('\n'));
  const code = await built.outputs[0]?.text();
  if (!code) throw new Error(`the ${bundle.out} worker bundled to nothing`);
  return Bun.write(join(APP_DIR, 'public', bundle.out, bundle.file), code);
}

/**
 * Put one worker and its runtime in place.
 *
 * @param bundle - Which one.
 */
async function vendor(bundle: Bundle): Promise<void> {
  await mkdir(join(APP_DIR, 'public', bundle.out), { recursive: true });
  const written = await Promise.all([
    ...bundle.wasm.map((file) => copyWasm(bundle, file)),
    ...bundle.downloads.map((download) => fetchModel(bundle, download)),
    buildWorker(bundle),
  ]);
  const total = written.reduce((sum, bytes) => sum + bytes, 0);
  const size = (total / 1e6).toFixed(1);
  console.info(`${bundle.out}: ${written.length} files, ${size} MB into public/${bundle.out}`);
}

for (const bundle of BUNDLES) await vendor(bundle);
