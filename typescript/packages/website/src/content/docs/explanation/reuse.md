---
title: Reuse is a link
description: Why Varar's answer to repeated setup is a Markdown link rather than a Background keyword — and why the tool leaves nesting depth to your judgement.
draft: true
---

Cucumber has `Background:`. Varar has no keyword for reuse at all, and for a
long time had no mechanism either — the advice was "inline the steps into the
examples that need them". This page explains what changed, and what deliberately
did not.

## First, the altitude argument

Most repeated setup is not a reuse problem. It is a step nobody wrote:

```markdown
I create a user "maya". I verify her email. I give her a library card.
I add *Dune* to the catalogue. I add *Emma* to the catalogue.
```

Five sentences, one idea. The fix is not to share them — it is to say the idea:

```markdown
Maya has a card at a library holding *Dune* and *Emma*.
```

This is the same argument as [thin steps](/explanation/thin-steps/), and it
covers most of what `Background:` is used for in Cucumber suites. Any reuse
mechanism risks licensing low-altitude setup that should have been collapsed,
which is why Varar had none for so long.

## The residue

Three cases the altitude argument does not cover:

- setup that genuinely is several *distinct* facts, and that the reader must see
  to judge the example — collapsing it hides the world state the oath is about;
- setup shared across several oath *files*, where the step definition is the
  only shared thing and the prose is copy-pasted;
- world states that deserve a name and a definition of their own — "a stocked
  library", "a tenant mid-trial".

## Why a link

Markdown already has the construct: GitHub slugs every heading into an anchor,
and a link to one is clickable before any tool touches it. So a block whose whole
content is a link to an oath section splices that section's steps in at that
point:

```markdown
[An overdue loan](./shared/an-overdue-loan.md#an-overdue-loan)

When she asks to borrow *Beloved* on June 10, 2026, the library refuses.
```

Three things fall out of that choice.

**It reads before it runs.** A reader who does not know what "an overdue loan"
assumes clicks the link and finds out. A `Background:` block, by contrast, is
invisible from inside the scenario that depends on it.

**It works anywhere, not just at the top.** Because the reference splices at its
own position, the same construct gives you a shared *act* in the middle of an
example and shared *assertions* at the end — neither of which `Background:` can
express.

**It stays block structure.** Varar's rule is that [the markup is
yours](/explanation/markup-is-yours/): format plugins own block structure, and
nobody touches inline text. A link-only *block* is structure. A sentence with a
link inside it would have put reference syntax in the middle of text the matcher
reads, so that spelling was rejected even though it reads more naturally.

## A referenced section is not also an example

Once an oath links to a section, that section runs *where it is referenced* and
nowhere else. The alternative — running it standalone as well — would duplicate
every shared section across the report, double its cost, and show one failure
N+1 times.

This has a consequence worth knowing: whether a section is a test depends on
whether anything else in the project links to it. That is why Varar builds a
project-wide view before planning any oath, and why a filtered run
(`vitest one.md`, `pytest one_dir/`) still discovers every oath first. A test's
existence must not depend on which files you happened to run.

## Depth is a style question, not a rule

A referenced section may contain references of its own, to any depth. Deep chains
are bad practice — a reader who must open three files to learn the world state
has lost more than the repetition saved — but Varar does not enforce a ceiling.

The line is that the tool enforces what is **checkable**: an anchor resolves, a
step matches, a claimed value holds. What is **tasteful** is left to prose, to
review, and to the guidance in your agent's instructions. A depth limit would be
the first place Varar told an author that a correct document was disallowed on
style grounds, and that is a bad precedent to set in a tool whose whole premise
is that the document belongs to you.

What is enforced is what cannot be argued with: a link that resolves to no oath,
a link to a section with no steps, and a cycle are all errors that fail the run.

## What this is not

- **Not a fixture graph.** A reference splices *steps*, in document order. There
  is no dependency resolution, no caching of state between examples, no
  ordering beyond what you wrote.
- **Not parameterised.** A reference names a section; it does not pass arguments
  to it. If the shared setup needs to vary, that is usually the signal that it
  wants to be a step with a parameter.
- **Not remote.** Targets are relative paths within your project. Linking an
  executable oath across organisations is an interesting idea and a separate
  one — it brings supply chain, offline builds and pinning with it.

See [Share setup between examples](/how-to/share-setup-between-examples/) for the
mechanics.
