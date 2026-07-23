---
title: Oaths that can't be theatre
description: The failure mode where an oath decorates the code instead of checking it — and the mechanisms Varar uses to make that fail loudly instead of passing quietly.
---

Every specification practice has the same well-known decay path. The oath is
written after the code, shaped to match whatever the code already does. Or it
was honest once, and then the code moved and the oath didn't. Or the checks
behind it quietly thinned out until the document *performed* confidence without
producing any. Call it **theatre**: a document that looks like a passing
specification and verifies nothing.

Most methodologies defend against theatre with process — review gates, sign-off,
discipline. Process works until it doesn't: vigilance decays, reviewers skim,
and when an AI agent is writing most of the code and the tests, the volume of
output makes "a human carefully checks that the oath really checks something"
the weakest link in the chain.

Varar's position is that theatre should be *mechanically unprofitable*: the
cheap ways an oath becomes decorative are made to fail the build, so what's left
for human judgment is small and well-defined. Three mechanisms do the work.

## The document holds the assertion

In most test frameworks the oath text and the assertion are two artefacts: a
sentence that claims something, and test code somewhere else that hopefully
checks it. The two can disagree — a scenario that says "the balance is 70" bound
to a step that asserts nothing at all still passes.

In Varar the value in the document *is* the assertion. A
[sensor](/reference/sensors/) returns what the software actually did, and Varar
compares that against the cells the document claims — the step body contains no
assertion to forget or fudge (see
[Varar overview](/explanation/varar-overview/)). And a sensor with slots cannot
opt out: returning nothing is a `ReturnShapeError` — *"a sensor with N slot(s)
must return one value per slot, got nothing"* — not a pass. There is no way to
write an example whose stated values are silently unchecked.

## An example can't quietly stop being one

The subtler theatre is a document that used to be executable and no longer is.
Rename a step, and the paragraph that matched it reverts to prose — still
rendered, still reading like a passing specification, no longer testing
anything. The suite stays green while covering less than it claims.

Varar treats that transition as [**drift**](/reference/examples/#drift-detection)
and fails the run until you explicitly acknowledge it. The acknowledgment
rewrites a committed baseline (`varar.lock.json`), so the decision "this
paragraph is intentionally no longer a test" is visible in review instead of
swallowed. An oath can stop being executable — but never silently.

## Failures land in the document

When a comparison fails, the diff is anchored to the exact source span of the
failing cell: the editor reddens the value in the Markdown and shows what the
software actually produced against it. That keeps the document the artefact you
debug — the place where the disagreement between claim and behaviour is
displayed is the place where the claim is written. An oath you never return to
is an oath free to rot; span-anchored failure keeps pulling you back into it.

## What mechanism can't catch

These mechanisms guard the *link* between the document and the code. They do
not guard the document's *meaning*, and it would be theatre of our own to
pretend otherwise. Nothing mechanical stops someone — human or agent — from:

- **editing a claimed value to whatever the code produced.** The example still
  matches, the comparison now passes, and the oath has been quietly weakened
  from "what we want" to "what we got";
- **deleting an example, or a whole oath file** (file removal is a different
  signal from drift, and is not gated);
- **writing examples that match and pass but claim very little.**

Every one of these changes the Markdown, which is why the human review unit in
Varar is the **oath diff**, not the code diff. The tooling shrinks the review
problem to a readable document written in your language — it doesn't remove it.
[Drive a feature with Varar and an agent](/how-to/drive-a-feature-with-an-agent/)
turns this boundary into a working loop.
