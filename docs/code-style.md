# Code style

This page covers what the linter cannot check: whether code is easy to read. The
linter decides everything mechanical, such as complexity, function length and
file length. Fix every warning before you continue.

The rules are ordered by how often they apply. Each one has an example to avoid
(✗) and an example to prefer (✓). When two options are equal, choose the one
that is easier for the next reader.

---

## 1. Return early

Check preconditions at the start of a function and return. The main logic then
runs without indentation. Do not put a return in the middle of a branch, because
the reader has to remember the state that led to it.

✗ Avoid: the main path is nested and the exits are scattered.

```ts
function resolveSession(event: Event | null, cache: SessionCache): Event | null {
  if (event) {
    if (event.type === 'START') {
      cache.set(event.sessionId, event.payload);
      return stripPayload(event);
    } else {
      const payload = cache.get(event.sessionId);
      if (payload) {
        return { ...event, payload };
      } else {
        return null;
      }
    }
  }
  return null;
}
```

✓ Prefer: the preconditions return first, and the main path is flat.

```ts
function resolveSession(event: Event | null, cache: SessionCache): Event | null {
  if (!event) return null;

  if (event.type === 'START') {
    cache.set(event.sessionId, event.payload);
    return stripPayload(event);
  }

  const payload = cache.get(event.sessionId);
  if (!payload) return null;

  return { ...event, payload };
}
```

---

## 2. Use array methods when they state the intent

`map`, `filter`, `find`, `some` and `flatMap` name the operation. A `for` loop
with a mutable accumulator makes the reader work the intent out.

✗ Avoid:

```ts
const activeIds: string[] = [];
for (let i = 0; i < sessions.length; i++) {
  if (sessions[i].active) {
    activeIds.push(sessions[i].id);
  }
}
```

✓ Prefer:

```ts
const activeIds = sessions
  .filter((session) => session.active)
  .map((session) => session.id);
```

Use a loop when you need to `break` early, when the transformation carries
state, or when a chain slows a hot path. A chain of five methods that nobody can
follow is worse than a plain loop.

---

## 3. Choose names that carry meaning

A name tells the reader what a thing is or does. `x`, `data`, `temp`,
`handleStuff` and `process()` make the reader look the thing up.
`remainingRetries`, `sessionPayload` and `dropStaleEvents` do not. Use one word
per concept. Do not mix `user`, `client` and `account` for the same thing.

✗ Avoid:

```ts
const d = events.filter((e) => e.ts > cutoff);
function proc(arr: Event[]) { /* ... */ }
```

✓ Prefer:

```ts
const recentEvents = events.filter((event) => event.timestamp > cutoff);
function enrichEvents(events: Event[]) { /* ... */ }
```

- A boolean reads as a predicate: `isBlinking`, `hasTarget`, `canInterrupt`.
- A function reads as a verb: `resolveTarget`, `stepSpring`.
- A collection is plural: `events`, `presets`.

### Short names

Do not use a name shorter than three characters. Do not use the generic words
`data`, `temp`, `err`, `res`, `msg`, `opts` or `ctx`. Write the full word:
`error`, `response`, `message`, `options`, `context`.

These exceptions are unambiguous, or a library imposes them:

| Name | Why it stays                                                       |
| ---- | ------------------------------------------------------------------ |
| `id` | Everybody understands it.                                          |
| `ok` | A boolean outcome, as HTTP and `Response` use it.                  |
| `db` | The database handle.                                               |
| `dt` | The frame delta in seconds, in the animation loop and the springs. |

No gate checks names. They are checked in review.

---

## 4. Give a function one job

A function does one thing at one level of abstraction. Split it when you need
"and" to describe it, or when you have to scroll to read it.

✗ Avoid: one function fetches, validates, transforms and stores.

```ts
async function handleEvent(raw: string): Promise<void> {
  const event = JSON.parse(raw) as Event;
  if (!event.sessionId) return;
  const ua = parseUserAgent(event.headers['user-agent']);
  event.browser = ua.browser;
  event.os = ua.os;
  if (event.error) {
    event.errorType = classifyError(event.error);
  }
  await store.index(event);
}
```

✓ Prefer: each step has a name and can be tested alone.

```ts
async function handleEvent(raw: string): Promise<void> {
  const event = parseEvent(raw);
  if (!event.sessionId) return;

  await store.index(enrichEvent(event));
}

function enrichEvent(event: Event): Event {
  return { ...event, ...resolveUserAgent(event), ...resolveError(event) };
}
```

Extract a function only when its name says more than the code it replaces. Do
not split logic into many one-line helpers that send the reader across ten
definitions to follow one idea.

---

## 5. Keep nesting shallow

The reader tracks one more piece of state for every level of indentation. Invert
a condition into a guard clause, or extract the inner block, before you write an
`if` inside an `if` inside a `for`.

✗ Avoid:

```ts
function summarise(reports: Report[]): Summary[] {
  return reports.map((report) => {
    if (report.entries) {
      return report.entries.map((entry) => {
        if (entry.valid) {
          return { id: entry.id, total: sum(entry.values) };
        }
      });
    }
  });
}
```

✓ Prefer:

```ts
function summarise(reports: Report[]): Summary[] {
  return reports
    .flatMap((report) => report.entries ?? [])
    .filter((entry) => entry.valid)
    .map(toSummary);
}

function toSummary(entry: Entry): Summary {
  return { id: entry.id, total: sum(entry.values) };
}
```

---

## 6. Prefer expressions to statements and flags

A value derived in one place is easier to follow than a variable changed across
branches. Use a ternary, `??` or a direct return before you use a mutable flag.

✗ Avoid:

```ts
let status: Status;
if (response.ok) {
  status = 'ok';
} else if (response.status >= 500) {
  status = 'retry';
} else {
  status = 'fail';
}
return status;
```

✓ Prefer:

```ts
function statusFor(response: Response): Status {
  if (response.ok) return 'ok';
  return response.status >= 500 ? 'retry' : 'fail';
}
```

---

## 7. Use the type system

A precise type removes defensive checks. Model data so that an illegal state
cannot be written, and the compiler checks the invariant for you.

- Do not use `any`. Use `unknown` and narrow it.
- Use a discriminated union before a set of optional fields.
- Use `readonly` and `as const` for data that does not change.
- Do not annotate a type the compiler already knows.

✗ Avoid: `any` removes the checks and forces runtime guards.

```ts
function area(shape: any): number {
  if (shape.type === 'circle') return Math.PI * shape.radius * shape.radius;
  if (shape.type === 'square') return shape.side * shape.side;
  return 0;
}
```

✓ Prefer: a discriminated union makes every case explicit and exhaustive.

```ts
type Shape =
  | { kind: 'circle'; radius: number }
  | { kind: 'square'; side: number };

function area(shape: Shape): number {
  switch (shape.kind) {
    case 'circle': return Math.PI * shape.radius ** 2;
    case 'square': return shape.side ** 2;
  }
}
```

---

## 8. Keep pure logic apart from side effects

Separate computation from I/O (network, disk, logging). A pure function takes
data and returns data, so you can read it and test it alone. Put the side
effects at the edges.

✗ Avoid:

```ts
async function reportTotals(userId: string): Promise<void> {
  const orders = await api.fetchOrders(userId);
  const total = orders.reduce((sum, order) => sum + order.amount, 0);
  await api.saveTotal(userId, total);
}
```

✓ Prefer: the calculation is pure and can be tested alone.

```ts
function totalAmount(orders: Order[]): number {
  return orders.reduce((sum, order) => sum + order.amount, 0);
}

async function reportTotals(userId: string): Promise<void> {
  const orders = await api.fetchOrders(userId);
  await api.saveTotal(userId, totalAmount(orders));
}
```

---

## 9. Components: return early and derive during render

The same rules apply to components. Return early for loading and empty states.
Derive a value during render. Do not copy a prop into state with an effect.

✗ Avoid: state and an effect for a value you can derive.

```tsx
function UserBadge({ user }: { user: User | null }) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    if (user) setLabel(user.name.toUpperCase());
  }, [user]);
  return <span>{label}</span>;
}
```

✓ Prefer: a guard clause, then a derived value.

```tsx
function UserBadge({ user }: { user: User | null }) {
  if (!user) return null;

  const label = user.name.toUpperCase();
  return <span>{label}</span>;
}
```

---

## 10. Comment the reason, not the action

The code already says what it does. Write a comment for what the code cannot
say: a constraint, a workaround, a rule from outside. A comment that repeats the
code goes out of date.

✗ Avoid:

```ts
// increment retries by one
retries += 1;
```

✓ Prefer:

```ts
// The dispatcher drops the connection after 3 silent minutes, so retry before then.
retries += 1;
```

---

## Match the code around you

When a local pattern exists, follow it, even when you would have chosen
differently. New code reads like the code next to it.

## Reference files

When you are unsure, match the style of these files:

| File                                | What to copy                                                                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/eyes/spring.ts`       | A pure function over a plain state object. No class, no allocation per frame, one comment for the one non-obvious line.      |
| `apps/web/src/eyes/emotions.ts`     | Data as data. Every expression is one row of a table, and the blending is three lines of arithmetic.                         |
| `apps/server/src/gemini/account.ts` | A boundary with one way through. Every call to Gemini gets its key and model from `forCall`, and nothing else reads the key. |
