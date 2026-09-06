---
title: varar lint
description: What `varar lint` checks, what it reports, the exit code it gives CI — and the one thing it deliberately never flags.
---

`varar lint` checks your oaths against the step definitions they bind to,
without running anything. It parses and plans every oath the config discovers,
using the same registry [`varar run`](/reference/examples/) uses — so it sees
what the runner would see, minus the execution.

```bash
varar lint            # the corpus varar.config.json discovers
varar lint 'docs/**/*.md'   # only these oaths (include-only override)
varar lint --json     # machine-readable
```

:::note
`lint` ships with the TypeScript CLI (`@varar/cli`). The Python and Ruby CLIs
offer `varar init` only; the other ports run their oaths through their test
framework's own runner.
:::

## What it checks

| Code | Severity | What it means |
| --- | --- | --- |
| `ambiguous-match` | error | Two or more step definitions match one sentence. Varar refuses to guess, so the example cannot run. |
| `error-fence-without-step` | error | An [expected-to-fail](/reference/examples/#expected-to-fail-examples) `error` fence sits on an example with no step to produce that failure. |
| `orphan-step` | warning | A step definition no sentence in any oath matches — dead code, usually the far half of a rename. |

Because lint loads your step files to build that registry, anything that stops
them loading — a syntax error, a failed import, two definitions registering the
same expression — fails the command with that error rather than a diagnostic.

## What it never flags

**A sentence that matches no step definition.** That is prose, and prose is the
point: an oath is a document that happens to be executable, so most of its
sentences are documentation and Varar stays quiet about them. There is no
"undefined step" list here, and its absence is deliberate — see
[Varar for Cucumber users](/explanation/varar-for-cucumber-users/).

The regression that *would* worry you — a sentence that used to be an example
and silently stopped matching — is caught by
[drift detection](/reference/examples/#drift-detection) against
`varar.lock.json`, which knows what used to run. Lint has no such memory.

## Exit code

| Code | When |
| --- | --- |
| `0` | No errors. Warnings do not fail the command. |
| `1` | At least one error-severity diagnostic, or the config or step files could not be loaded. |

That makes `varar lint` usable as a CI gate on its own:

```yaml
- run: varar lint
```

Orphan warnings never break the build. They are reported only when both:

- you linted the **whole** configured corpus — a glob argument narrows the
  oaths, which would make every step the excluded documents use look dead; and
- nothing else reported an error — one ambiguous sentence leaves all of its
  candidate definitions unmatched, and listing them as orphans on top of the
  ambiguity is noise. Fix the errors, then ask about orphans.

## Output

One line per diagnostic, `path:line:column  severity  code  message`, with paths
relative to the working directory:

```
varar/division.md:3:1  error  ambiguous-match  Ambiguous step: "I divide 6 by 3"
src/varar/greeting.steps.ts:8:1  warning  orphan-step  No sentence in any oath matches this step: "I wave at {string}".
```

`--json` writes one object instead, with the message unabridged:

```json
{
  "diagnostics": [
    {
      "path": "varar/division.md",
      "severity": "error",
      "code": "ambiguous-match",
      "line": 3,
      "col": 1,
      "message": "Ambiguous step: \"I divide 6 by 3\"\nMatched by:\n  'I divide {int} by {int}'    at src/varar/division.steps.ts:5\n  'I divide 6 by {int}'    at src/varar/division.steps.ts:7"
    }
  ]
}
```

This is lint output — plan diagnostics about your source. It is a different
thing from the [run results](/reference/run-results/) a run writes to
`.varar/<oath>.json`, which record what happened when the examples executed.
