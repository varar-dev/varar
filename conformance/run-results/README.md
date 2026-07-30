# Run-result wire format

One fixture, `expected.json`, holding a known `OathResults` payload. Every port
builds that same value in its own types, serializes it, and compares the parsed
result — deep equality, not bytes.

## What this pins, and why it is separate from `bundles/`

`bundles/*/golden/trace.json` already pins what a failure *contains* across
ports: its `anchor`, `cells`, `line` and `message` are compared for every
bundle. That is the semantics of a failure.

This corpus pins the **shape of the file the language server reads**:

- field names — `oathPath`, not `oath_path`;
- optional members **absent**, never `null`: a passing example has no `failure`
  key, a failure with no cells has no `cells` key;
- the value types — `lines` an array of numbers, `anchor` an object of two
  offsets.

Not pinned, deliberately: key order, indentation, escaping, trailing newline.
Those belong to whichever writer produced the file. A port is free to emit
`\u00A3` where another emits `£` — both parse to the same string, and the LSP
reads the same payload.

## The value every port builds

Three examples, one per branch of the writer:

1. **passed** — no `failure` key at all.
2. **failed with a mismatch** — `cells` and `anchor` both present, a `£` in the
   name and a `\n` in the message.
3. **failed by throwing** — `failure` present, `cells` and `anchor` both absent.

`stack` is fixed to `<stack>` here. On disk it is runtime-shaped (a V8 stack, a
JVM trace, a rendered Rust location) and no consumer parses it — but it is part
of the payload, so the fixture carries it.

## Regenerating

TypeScript is the reference implementation: `expected.json` is what
`JSON.stringify(results, null, 2) + "\n"` produces there. If the payload ever
changes deliberately, change it in TypeScript first, regenerate, and let the
other six ports go red until they follow.
