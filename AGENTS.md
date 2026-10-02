# Agent guide, m8

This file gives AI coding agents the context they need to work in this
repository. Read all of it before you write code. Then read
`docs/architecture.md`.

## What this project is

m8 is a character that lives in a browser tab as a pair of eyes. He sees through
the webcam, hears through the microphone, talks through a realtime speech model,
decides where to look, and keeps a memory that he summarizes himself.

m8 is a learning project. Clarity, observability and replaceable parts matter
more than polish or features.

## Read these first

| Document                           | What it is                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| `docs/architecture.md`             | The structure, the contracts and the rules. If it is wrong, say so and propose the change. |
| `docs/code-style.md`               | Readability rules that the linter cannot check.                                            |
| `docs/CONTRIBUTING.md`             | Setup, the quality gate, the rules and the commit format.                                  |
| `docs/documentation-guidelines.md` | How to write TSDoc and comments.                                                           |

The maintainer keeps a roadmap in `docs/roadmap.md` and decision records in
`docs/adr/`. Git excludes both.

- Read them when they are on disk. They give the reasons behind the design.
- Never link to them from a tracked file. The link does not work for anyone
  else.
- Never cite a decision record number or a roadmap milestone in code, comments
  or tracked docs. Write the reason itself.

## Repository layout

The repository is a set of Bun workspaces. Bun is the runtime, the package
manager and the test runner.

| Workspace           | What it is                                                                          |
| ------------------- | ----------------------------------------------------------------------------------- |
| `apps/web`          | Vite, React, TypeScript. The character and everything that runs at frame rate.      |
| `apps/server`       | Hono on Bun. Serves the web build in production. Vite proxies to it in development. |
| `packages/shared`   | Zod contracts. Every boundary in the system is a schema here.                       |
| `packages/salience` | The leaky integrate-and-fire filter. Pure TypeScript, no dependencies.              |
| `packages/persona`  | The frozen core persona and its loader.                                             |

## Commands

```sh
bun install       # dependencies and the git hooks
bun run dev       # web on :3000 and server on :3001, together
bun run check     # the whole gate: lint, docs, arch, knip, typecheck, test
bun run build     # production build of both apps
bun run start     # serve the build on one port (:3001); --host and --port like Vite
bun run lint      # Biome check
bun run format    # Biome format --write
bun run docs:check  # markdown formatting and links (remark)
bun run docs:format # rewrite the markdown
bun run arch      # dependency-cruiser layer boundaries
bun run knip      # dead code, unused exports and dependencies
bun run typecheck # tsc --noEmit per workspace
bun test          # unit tests (bun:test)
```

You can run one test file with `bun test apps/web/src/eyes/spring.test.ts`.

## Hard rules

Breaking one of these rules is a bug.

- **No model names in code.** Code names a job: `live` or `memory`. The model
  for each job is a setting. The person chooses it from the list Gemini returns
  for their key, and `apps/server/src/gemini/account.ts` resolves it on every
  call. Tests may name models in a fake listing.
- **Contracts first.** Data that crosses a module boundary is a Zod schema in
  `packages/shared` with an inferred type. Do not define the same type twice.
- **The eyes never wait on the network.** Nothing in `apps/web/src/eyes` imports
  `brain`, `senses`, `voice`, `fusion`, `mood` or `debug`. Nothing in it performs
  I/O. It reads the bus. `bun run arch` fails otherwise.
- **Modules meet on the bus.** `senses/*` may import `bus` and nothing else in
  the app. The bus imports nothing from the app.
- **The sense workers are built outside Vite.**
  `apps/web/scripts/vendor-workers.ts` builds them into `public/vision/` and
  `public/hearing/`. They do not hot reload. Run `bun run vendor` after you
  change anything they import. MediaPipe loads its wasm with `importScripts`,
  which needs a classic worker, and the Vite dev server serves only module
  workers.
- **The rig is deterministic for a given seed.** The brainstem takes its
  randomness from `createSeededRandom`, and a recording stores the seed. Do not
  call `Math.random` inside `eyes/`. It breaks replay.
- **No secrets in the repository.** The Gemini key arrives through the app and
  is stored sealed in SQLite. The key that seals it lives in `keys/`, which git
  ignores. `.env.example` lists every variable, and every one is optional.
- **The browser never talks to a provider.** The browser opens one websocket to
  Hono. Hono holds the key and calls Gemini directly: the live session over its
  websocket, the memory over REST. The browser sees the key masked.
- **Mood changes with what he reacted to, not with what reached his senses.**
  Motion arrives twelve times a second. If every frame raises arousal, arousal
  stays at its maximum and the threshold rises until nothing can fire.
- **Answer a tool call at once.** The model produces no audio until the tool
  result arrives. A tool that waits on the network stops his speech.
- **Keep dependencies minimal.** Do not add an animation library or a state
  management library. The spring is fifteen lines of our own code.

## Runtime rule: apps/web is browser code

- `apps/web/src` must not import `bun` or `bun:*` outside tests. A Biome rule
  enforces this.
- `apps/server` and `scripts/` may use Bun APIs.
- Use Bun everywhere: `bun <file>`, `bun install`, `bun test`, `bunx`. Do not use
  npm, node, jest or vitest.
- TypeScript stays pinned to `6.0.3`. dependency-cruiser cannot parse TypeScript
  7, and it then checks zero modules without an error.

## Verifying libraries

Libraries in this ecosystem change every month. Check the current version and
API of a library in its official documentation before you use it. Pin exact
versions. Do not rely on memory.

## Quality gates

`bun run check` runs these in order: Biome, remark, dependency-cruiser, knip,
`tsc --noEmit` per workspace, and `bun test`. All of them must pass before work
is done.

- **pre-commit**: Biome on the staged files.
- **pre-push**: `bun run check`.
- **CI** (`.github/workflows/quality.yml`): the same gate, plus commitlint on
  pull requests.

Do not skip the hooks. Fix every warning when it appears.

`.dependency-cruiser.cjs` implements section 11 of the architecture document. An
import that breaks a boundary fails the gate. When you add a boundary, add a
rule for it.

## Commits

Use Conventional Commits: `type(scope): description`. The valid types are
`feat`, `fix`, `chore`, `docs`, `refactor`, `test` and `ci`. commitlint runs on
`commit-msg`.

## Writing

Documentation, comments, commit messages and user-facing strings use direct
language.

- Write plain declarative sentences. State the fact, then at most one sentence
  of why.
- Write subject, verb, object. Address the reader as "you" and say what they can
  do: "You can open the rig in a production build by switching on Developer
  options", never "The rig is gated behind a setting, so a production build
  hides it".
  This applies to every text, the README included.
- No em-dashes and no en-dashes, anywhere: code, comments, docs, commit messages,
  strings. Use commas, colons, parentheses, periods.
- No rambling, aphorisms or clever turns. No "X is what makes Y"; write the fact
  or "Y because X".
- No idioms or unusual verbs. Name things for what they are. No cute jargon.
- One fact per bullet. Paragraphs of one to three short sentences.
- Reference docs carry no essays. A one-line table entry is the documentation;
  add a section only when asked.
- TSDoc every declaration, private ones included, with complete `@param` and
  `@returns`. Module headers are one line where one line is enough.

## What not to do

- Do not run parallel agents over this working tree. Work in one context, in
  sequence. If you need parallel agents, give each one its own git worktree, and
  let none of them run `git stash`, `git checkout` or `git restore`.
- Do not add a model name to a TypeScript file.
- Do not give `apps/web/src/eyes` a network call, a React state hook that drives
  animation, or an import from `brain`.
- Do not install an animation library, a state management library, ESLint or
  Prettier.
- Do not format markdown tables by hand. `bun run docs:format` formats them.
- Do not call a model provider from the browser.
