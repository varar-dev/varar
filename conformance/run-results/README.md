# Run-result wire format

One fixture, `expected.json`, holding the byte-exact serialization of a known
`OathResults` value. Every port builds that same value in its own types,
serializes it, and compares — byte for byte, trailing newline included.

## What this pins, and why it is separate from `bundles/`

`bundles/*/golden/trace.json` already pins what a failure *contains* across
ports: its `anchor`, `cells`, `line` and `message` are compared byte-for-byte
for every bundle. That is the semantics.

This corpus pins how the payload is **written to disk** — which is a different
contract, and the one the language server depends on:

- field names (`oathPath`, not `oath_path`), and their order;
- 2-space indent, LF, and the trailing newline;
- non-ASCII emitted raw (`£`, not `£`) and `\n` escaped, exactly as
  `JSON.stringify` does;
- optional members **absent**, never `null` — a passing example has no
  `failure` key, a failure with no cells has no `cells` key;
- `<`, `>` and `&` left raw (Go's encoder escapes them by default; .NET's
  escapes non-ASCII by default — both have to be told not to).

A port that gets the semantics right and the bytes wrong writes a file the LSP
can still parse but a human diffing two ports' output cannot compare, and the
next field added drifts silently. ADR 0014 has the reasoning.

## The value every port builds

Three examples, chosen to exercise each branch of the writer:

1. **passed** — no `failure` key at all.
2. **failed with a mismatch** — `cells` and `anchor` both present, a `£` in the
   name and a `\n` in the message.
3. **failed by throwing** — `failure` present, `cells` and `anchor` both absent.

`stack` is fixed to `<stack>` here. On disk it is runtime-shaped (a V8 stack, a
JVM trace, a rendered Rust location) and no consumer parses it — but its
*position* in the payload is part of the format, so the fixture keeps it.

## Regenerating

TypeScript is the reference implementation: `expected.json` is what
`JSON.stringify(results, null, 2) + "\n"` produces there. If the format ever
changes deliberately, change it in TypeScript first, regenerate, and let the
other six ports go red until they follow.
