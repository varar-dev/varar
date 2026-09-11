---
title: Share setup between examples
description: Reuse a world state across examples by linking to the section that describes it — in the same oath or another one.
draft: true
---

When several examples start from the same world state, write that state once,
under its own heading, and **link to it**. A block whose entire content is a
link to an oath section splices that section's steps in at that point.

## Before you start

- Oaths that repeat the same setup, where the repeated part is several distinct
  facts the reader needs to *see*.
- If the repetition is really one idea spelled out in five sentences, write the
  step you are missing instead — see [Is this reuse, or a missing
  step?](#is-this-reuse-or-a-missing-step) below.

## 1. Give the world state a section

Put the shared setup under a heading, conventionally in `varar/shared/`:

```markdown
<!-- varar/shared/an-overdue-loan.md -->
# Shared world states

The sections below are linked from the oaths that need them, and run there.

## An overdue loan

Noor borrowed *Kindred*, due back on June 1, 2026.
```

## 2. Link to it from each example

```markdown
<!-- varar/reuse.md -->
# Borrowing while overdue

[An overdue loan](./shared/an-overdue-loan.md#an-overdue-loan)

When she asks to borrow *Beloved* on June 10, 2026, the library refuses.
```

The link is an ordinary Markdown link: it renders on GitHub, and clicking it
takes the reader to the world state the example assumes. The anchor is the
heading's GFM slug — the same anchor GitHub generates.

A reference works three ways:

- **`#a-heading`** — a section of the same oath.
- **`./other.md#a-heading`** — a section of another oath, path relative to the
  oath doing the linking.
- **`./other.md`** — the whole of another oath.

All three spellings of the *block* mean the same thing, so pick what reads best:

```markdown
[An overdue loan](./shared/an-overdue-loan.md#an-overdue-loan)

> [An overdue loan](./shared/an-overdue-loan.md#an-overdue-loan)

- [An overdue loan](./shared/an-overdue-loan.md#an-overdue-loan)
- [Fees are enabled](./shared/billing.md#fees-are-enabled)
```

A link-only block pointing anywhere else — `https://…`, a `.ts` file — is
ordinary prose, exactly as before.

## 3. Reference from anywhere in the example

Because a reference splices steps in *at its own position*, it is not limited to
setup. A shared act, mid-example:

```markdown
Maya borrows *Emma* on May 25, 2026.

[The nightly batch runs](./shared/jobs.md#the-nightly-batch)

Her account shows a £0.50 fee.
```

Or shared assertions, at the end:

```markdown
Maya returns *Emma* late and pays the fee.

[The ledger invariants hold](./shared/invariants.md#the-ledger-invariants-hold)
```

The spliced steps share the example's state, exactly as if you had written them
in place.

## What to expect

- **A referenced section stops being a standalone example.** It runs where it is
  referenced, once per referencing example — not twice.
- **The example keeps its own name.** An example that opens with a reference is
  named after its own first matching paragraph, not the section it pulls in.
- **A broken link fails the run.** A link to a file that is not an oath, or to a
  heading that contributes no steps, is an error — never silently prose.
- **Failures point at the file the step was written in.** A mismatch inside a
  shared section reports against that section's source, not the oath that
  referenced it.

## Is this reuse, or a missing step?

Varar's first answer to repetition is not a reference — it is **a step at the
right altitude**. This:

```markdown
I create a user "maya". I verify her email. I give her a library card.
I add *Dune* to the catalogue. I add *Emma* to the catalogue.
```

wants to be one sentence:

```markdown
Maya has a card at a library holding *Dune* and *Emma*.
```

Reach for a reference when the setup is several facts the reader must see to
judge the example — not when it is one idea nobody has named yet.

## How deep to nest

A referenced section may itself contain references, to any depth. Varar does not
stop you, because the parser cannot tell a justified chain from a careless one.
**One level, two at the outside.** A reader who has to open three files to learn
what the world state is has lost more than the repetition saved — and so has the
agent generating the next example. If a chain is getting deep, that is the signal
to collapse it into a step.

A cycle — a chain that reaches a section already on it — is an error, reported
with the whole chain.
