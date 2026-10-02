/**
 * Architecture boundaries, section 11 of docs/architecture.md. The workspaces
 * and the folders under apps/web/src are the layers:
 *   packages/shared    - Zod contracts. The only thing both apps may import.
 *   packages/salience  - pure spiking filter math. Imports nothing.
 *   packages/persona   - the frozen core persona and its loader.
 *   apps/server        - Hono on Bun. Never imports apps/web.
 *   apps/server/secrets - seals the Gemini key. Only gemini/ and the entry use it.
 *   apps/web/senses    - capture and workers. Speaks only through the bus.
 *   apps/web/bus       - the typed event bus every browser module meets on.
 *   apps/web/fusion    - salience outcomes: ignore, note, interrupt.
 *   apps/web/mood      - mood variables, decay toward baseline.
 *   apps/web/brain     - websocket client and client-side tool dispatch.
 *   apps/web/eyes      - the rig, the brainstem, the gaze arbiter. No I/O.
 *   apps/web/voice     - streamed playback and barge-in.
 *   apps/web/debug     - observability. May look at anything.
 * Run with `bun run arch`.
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies make the graph hard to reason about.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-test-deps-in-src',
      severity: 'error',
      comment: 'Production code must not import test files.',
      from: { pathNot: '\\.test\\.(ts|tsx)$' },
      to: { path: '\\.test\\.(ts|tsx)$' },
    },
    {
      name: 'packages-never-import-apps',
      severity: 'error',
      comment: 'The packages are the shared bottom. An app is a consumer, never a dependency.',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
    {
      name: 'salience-is-self-contained',
      severity: 'error',
      comment:
        'packages/salience is pure TypeScript with no dependencies, so the filter ' +
        'math can run in a browser, on the server, or in a test with nothing around it.',
      from: { path: '^packages/salience/src/', pathNot: '\\.test\\.(ts|tsx)$' },
      to: { pathNot: '^packages/salience/src/' },
    },
    {
      name: 'persona-stays-thin',
      severity: 'error',
      comment: 'The persona package loads one file. It knows no other module.',
      from: { path: '^packages/persona/src/', pathNot: '\\.test\\.(ts|tsx)$' },
      to: { path: '^(packages|apps)/', pathNot: '^packages/persona/src/' },
    },
    {
      name: 'shared-stays-pure',
      severity: 'error',
      comment:
        'The contracts must be importable from a browser and from Bun, so they ' +
        'depend on zod and their own modules only.',
      from: { path: '^packages/shared/src/', pathNot: '\\.test\\.(ts|tsx)$' },
      to: {
        pathNot: '^packages/shared/src/|^node_modules/zod/',
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'web-not-into-server',
      severity: 'error',
      comment:
        'The browser reaches the server over HTTP and one websocket, never by import. ' +
        'They meet only through packages/shared.',
      from: { path: '^apps/web/' },
      to: { path: '^apps/server/' },
    },
    {
      name: 'server-not-into-web',
      severity: 'error',
      comment: 'The server renders no UI.',
      from: { path: '^apps/server/' },
      to: { path: '^apps/web/' },
    },
    {
      name: 'the-gemini-key-has-one-way-out',
      severity: 'error',
      comment:
        'The secret box opens the Gemini key. Only the account uses it, and only ' +
        'the entry builds it, so every call to Gemini gets its key from forCall.',
      from: {
        path: '^apps/server/src/',
        pathNot:
          '^apps/server/src/(gemini|secrets)/|^apps/server/src/index\\.ts$|\\.test\\.(ts|tsx)$',
      },
      to: { path: '^apps/server/src/secrets/' },
    },
    {
      name: 'senses-speak-through-the-bus',
      severity: 'error',
      comment:
        'Capture and workers publish events. They never reach into the eyes, the ' +
        'voice, or the brain. The bus is the only module they may know about.',
      from: { path: '^apps/web/src/senses/', pathNot: '\\.test\\.(ts|tsx)$' },
      to: {
        path: '^apps/web/src/',
        pathNot: '^apps/web/src/(senses|bus)/',
      },
    },
    {
      name: 'the-bus-knows-nobody',
      severity: 'error',
      comment:
        'The bus is the bottom of the browser app. It carries contracts and has ' +
        'no opinion about who is listening.',
      from: { path: '^apps/web/src/bus/', pathNot: '\\.test\\.(ts|tsx)$' },
      to: { path: '^apps/web/src/', pathNot: '^apps/web/src/bus/' },
    },
    {
      name: 'eyes-never-wait-on-the-network',
      severity: 'error',
      comment:
        'The fast loop must never block on the slow one. The eyes read targets ' +
        'handed to them; they do not fetch, and they do not know the brain exists.',
      from: { path: '^apps/web/src/eyes/', pathNot: '\\.test\\.(ts|tsx)$' },
      to: { path: '^apps/web/src/(brain|senses|voice|fusion|mood|debug)/' },
    },
    {
      name: 'eyes-internals-are-private',
      severity: 'error',
      comment:
        'The rig, the springs, the brainstem and the gestures are private. The app ' +
        'sees apps/web/src/eyes/index.ts, which is the three functions the model ' +
        'tools call. Only the debug panel is allowed further in, and that is what ' +
        'it is for.',
      from: {
        path: '^apps/web/src/',
        pathNot: '^apps/web/src/(eyes|debug)/|\\.test\\.(ts|tsx)$',
      },
      to: {
        path: '^apps/web/src/eyes/',
        pathNot: '^apps/web/src/eyes/index\\.ts$',
      },
    },
    {
      name: 'only-fusion-and-brain-send-senses-messages',
      severity: 'error',
      comment:
        'Section 11: the senses.* wire messages have exactly two senders, so there ' +
        'is one place to look when the model hears something it should not. They ' +
        'are sent through brain/client.ts, which is what this guards. The rest of ' +
        'brain/ is a session the composition root may mount like anything else.',
      from: {
        path: '^apps/web/src/',
        pathNot: '^apps/web/src/(brain|fusion)/|\\.test\\.(ts|tsx)$',
      },
      to: { path: '^apps/web/src/brain/client\\.ts$' },
    },
    {
      name: 'mood-is-a-leaf',
      severity: 'error',
      comment:
        'Mood is read by fusion and the brain. It reads nobody, so it cannot ' +
        'develop an opinion about what it is modulating.',
      from: { path: '^apps/web/src/mood/', pathNot: '\\.test\\.(ts|tsx)$' },
      to: { path: '^apps/web/src/', pathNot: '^apps/web/src/mood/' },
    },
    {
      name: 'nobody-imports-the-debug-panel',
      severity: 'error',
      comment:
        'Debug observes. Nothing depends on it, so it can be removed or rewritten ' +
        'without touching the app. Only the composition root mounts it.',
      from: { pathNot: '^apps/web/src/(debug/|app\\.tsx$)' },
      to: { path: '^apps/web/src/debug/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    exclude: {
      path: 'node_modules|^dist/|^coverage/',
    },
  },
};
