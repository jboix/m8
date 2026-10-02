# Documentation guidelines

This page says how to write TSDoc and code comments in this repository.

> **Code shows how. A comment states what, why, and the contract.**

The rules apply to every comment in every file: TypeScript, CSS, config and
shell. The `@param` and `@returns` conventions are specific to TypeScript. The
rest applies to a CSS comment as it does to TSDoc.

## Document the contract

Document what a function guarantees, not how it does it. Use this test: if you
rewrote the body completely, would the doc still be true? If yes, the doc is at
the right level.

```ts
// Good: the contract
/** Returns the hero with the given id. @throws {Error} if no hero has that id. */

// Bad: the implementation
/** Looks the hero up in the party array with find() and returns it. */
```

## Describe the code as it is

A comment describes the code as it is now. Do not write about:

- development phases ("Phase 7", "carried over from Phase 5"),
- decisions made on the way ("we decided", "for now"),
- migrations ("was duplicated in", "retired in", "legacy"),
- plans ("may return later as").

Put that in the commit message. A comment about history is wrong as soon as the
history changes.

## What to include

- One sentence that answers "why would you call this?"
- `@param` for every parameter.
- `@returns` when a value is returned. Leave it out for `void`, type predicates
  and constructors.
- `@throws {Type}` for every failure a caller can observe. Leave out internal
  failures.
- `{@link Symbol}` when a related symbol helps the reader.
- Behaviour a caller can rely on: side effects, ordering, immutability,
  determinism, cached or stale results.

No kind of declaration is exempt. Document React components, constructors,
getters and setters like any other function.

## What to leave out

- The signature restated in words ("Sets the name." over `setName`).
- Obvious implementation details ("iterates the list and compares").
- Anything a reader can see at once in a short body.

## Keep it short

Most docs are a summary line plus tags, 2 to 6 lines. Add detail only when a
caller needs it.

## Use `//` inside a body, and TSDoc above a declaration

Put a `//` comment inside a body, next to the statement it explains. Write
everything above a declaration as a `/** */` block.

This applies to functions, methods, properties, fields, type and interface
members, and module constants. It applies whether or not they are exported.

```ts
// Bad: a // block in place of a doc
// Redeem a grant. Single use.
function consumeGrant(token: string): string | null {

// Good
/**
 * Redeem a grant (single use: a second redemption fails).
 * @param token - The token presented on the upgrade.
 * @returns The owner it was minted for, or `null` when unknown or spent.
 */
function consumeGrant(token: string): string | null {
```

Document members the same way:

```ts
// Bad
interface SessionContext {
  // the browser socket
  client: WebSocket;
}

// Good
interface SessionContext {
  /** The browser socket. */
  client: WebSocket;
}
```

## Keep an inline comment to two lines

An inline `//` comment has at most two lines. If you need more, the text is
documentation. Move it into the TSDoc of the enclosing function, under
`@remarks` when it does not fit the summary, or delete it.

## Document private functions and tests

- Document a private function to the same standard and in the same TSDoc form as
  an exported one.
- In a test file, state the behaviour under test in the file comment and in each
  `describe`. Do not state the phase or the decision that led to the test.

## Template

```ts
/**
 * <one-sentence purpose>.
 * @param x - <meaning of x>.
 * @param y - <meaning of y>.
 * @returns <what is returned and any guarantee>.
 * @throws {SomeError} <when the operation cannot complete>.
 */
```

## Enforcement

No script checks these rules. `bun run check` covers Biome, the architecture
boundaries, dead code, types and tests. These rules are checked in review.
