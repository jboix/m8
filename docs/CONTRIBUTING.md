# Contributing to m8

Thanks for contributing. Agents working in this repository also follow
[AGENTS.md](../AGENTS.md). Participation is governed by the
[Code of Conduct](./CODE_OF_CONDUCT.md).

m8 is a learning project. Clarity, observability and replaceable parts matter
more than polish or features. Read [architecture.md](./architecture.md) before
you change how the parts connect.

## Setup

```sh
bun install        # dependencies and the git hooks
bun run dev        # web on :3000, server on :3001
bun run check      # everything CI checks
bun run pack       # the npm package @jboix/m8, into out/
```

`check` runs:

| Step                 | Tool               | Checks                                           |
| -------------------- | ------------------ | ------------------------------------------------ |
| `bun run lint`       | Biome              | Formatting, lint rules, function and file length |
| `bun run docs:check` | remark             | Markdown formatting and broken links             |
| `bun run arch`       | dependency-cruiser | The layer boundaries from section 11, and cycles |
| `bun run knip`       | knip               | Dead code, unused exports and dependencies       |
| `bun run typecheck`  | tsc                | Type errors, per workspace                       |
| `bun test`           | bun:test           | Unit tests                                       |

- You need Bun 1.4 or later and a Gemini API key.
- Use Bun for everything: not npm, node, jest or vitest.
- The two sense workers do not hot reload. Run `bun run vendor` after you
  change anything they import.

## The debug rig

The rig shows every parameter of the eyes, the session, the senses and the
memory, and an event log you can record and replay. `bun run dev` always shows
its bug button on the stage. In a production build, switch on Developer options
in the settings.

## Rules

Each of these is checked automatically or in review:

1. **No model names in code.** Code names a job, `live` or `memory`. The model
   for each job is a setting, chosen from the list Gemini returns for the key.
2. **Contracts first.** Data crossing a module boundary is a Zod schema in
   `packages/shared` with an inferred type. No duplicate type definitions.
3. **The eyes never wait on the network.** Nothing in `apps/web/src/eyes`
   imports the brain, the senses, the voice, fusion, mood or debug, and nothing
   in it performs I/O. `bun run arch` fails otherwise.
4. **Modules meet on the bus.** `senses/*` may import `bus` and nothing else in
   the app. The bus imports nothing from the app at all.
5. **The rig is deterministic given a seed.** Randomness inside `eyes/` comes
   from `createSeededRandom`, and a recording stores its seed. `Math.random`
   there breaks replay.
6. **The browser never talks to a provider.** One websocket to the server,
   which holds the key and opens the upstream session.
7. **Answer a tool call at once.** The model produces no audio until a tool
   result arrives. A tool that waits on the network stops his speech.
8. **No secrets in the repo.** The Gemini key is stored sealed in the database,
   and the key that seals it lives in `keys/`, which git ignores.
   `.env.example` lists every variable.
9. **Dependencies stay minimal.** No animation library and no state management
   library. Check a library's current version and API against its documentation
   before using it, and pin exact versions.

## Writing

Documentation, comments, commit messages and user-facing strings use direct
language.

- Write plain declarative sentences: subject, verb, object.
- Address the reader as "you" and say what they can do.
- Write one fact per bullet, and paragraphs of one to three short sentences.
- Do not use em-dashes, en-dashes, idioms or clever phrasing.
- Give every declaration TSDoc, private ones included.

See [code-style.md](./code-style.md) and
[documentation-guidelines.md](./documentation-guidelines.md).

## Commits

Conventional Commits: `type(scope): description`. Valid types are `feat`, `fix`,
`chore`, `docs`, `refactor`, `test` and `ci`. The types decide the next release:
`fix` is a patch, `feat` a minor, a breaking change a major.

`bun install` sets up the git hooks. Do not skip them.

| Hook         | What it runs              |
| ------------ | ------------------------- |
| `commit-msg` | commitlint                |
| `pre-commit` | Biome on the staged files |
| `pre-push`   | `bun run check`           |

## Style

If `bun run check` passes, the style is right. If you disagree with a check,
open an issue. Do not argue it in the pull request.
