---
title: Install Varar
description: Install and configure Varar
area: guides
order: 1
---

# Install Varar

This guide covers the TypeScript package, `@varar/varar`. (A Python port,
`pytest-varar`, also exists — dual-language tabs for this guide are coming.)
You need Node ≥ 22 LTS. It doesn't matter whether you're installing into an
existing project or starting one from scratch.

## Install

Open a terminal and add Varar as a dev dependency:

```bash
pnpm add -D @varar/varar
```

## Scaffold a project

```bash
pnpm exec varar init
```

This creates a config file and a first example, side by side:

```
created varar.config.json
created varar/hello-varar.md
created src/varar/hello-varar.steps.ts
```

`varar.config.json` says which files are oaths and which files bind their steps:

```json
{
  "docs": { "include": ["varar/**/*.md"], "exclude": [] },
  "steps": ["src/varar/**/*.steps.ts"]
}
```

And `hello-varar.md` is the oath itself — plain prose with one concrete example:

```markdown
# Hello, Varar

I greet "world". The greeting should be "Hello, world!".
```

## Run it

```bash
pnpm vitest run
```

The freshly scaffolded example passes:

```
✓ varar/hello-varar.md (1 test) 1ms

Test Files  1 passed (1)
     Tests  1 passed (1)
```

## Watch it fail on purpose

[Never trust a test you haven't seen fail.](/var/docs/concepts/the-oaths-of-var/)
A passing example you've never seen go red might be testing nothing at all.
Open `src/varar/hello-varar.steps.ts` and change the greeting it
produces:

```ts
stimulus('I greet {string}', (_state, name) => ({ greeting: `Hi, ${name}!` }))
```

Run it again:

```bash
pnpm vitest run
```

Now the oath is *broken* — the oath still says `"Hello, world!"`, but the step
produces something else:

```
× varar/hello-varar.md > Hello, Varar
  → expected "Hello, world!", actual "Hi, world!"

Test Files  1 failed (1)
     Tests  1 failed (1)
```

Revert the change and run once more. The oath is *kept* again:

```
Test Files  1 passed (1)
```

## Next

- [Hello Varar: your first oath](/var/docs/start-here/hello-varar-your-first-oath/) walks through writing an oath from a blank file.
- [Wire Varar into your AI agent's instructions](/var/docs/guides/wire-var-into-agent-instructions/) so an agent writes oaths first.
