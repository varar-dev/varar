# Documentation plan: ready for Show HN

A page-by-page audit of varar.dev against Diátaxis, and the changes to make
before a Show HN. The messaging decisions come first because every page change
follows from them.

**Status: proposed (2026-09-17).** Nothing here has landed.

## 1. What we learned

The input is the HN thread on OpenSpec (item 49734264, 142 points, 64
comments, 2026-09-16) and a gap analysis of OpenSpec against Varar. The
findings that matter for the docs:

1. **Spec drift is the dominant complaint, and it is unsolved.** Eight
   commenters raised it unprompted. The longest-term users churned because of
   it: "I used an LLM to assess in both directions whether the code matched
   the specs ... huge divergence"; "the code IS the specification"; "the spec
   almost immediately becomes out of date"; "spec drift is the main reason why
   none of these tools work".
2. **Every remedy on offer is an LLM judging code against prose.** OpenSpec's
   `/opsx:verify`, a daily "observer agent", a bidirectional LLM assessment.
   Nobody proposed a mechanical check. Nobody mentioned executable
   documentation, BDD, Cucumber or Gherkin — the category is not in
   their vocabulary, for better and for worse.
3. **The wish is a contract that gets evaluated after implementation.** "Shared
   documents that serve as a contract that then gets evaluated
   post-implementation"; "the important thing is to have a file reviewers can
   audit the code against".
4. **The hostility is toward volume and ceremony.** "A large set of multiple
   markdown documents, each that need review ... always slop"; "how do I review
   so many files"; "illusion of control"; "even OpenSpec is too heavy for me".
5. **They want the why, with evidence.** "What I'd like to see is what it is,
   how and why it works, ideally backed by some benchmarks. Otherwise it looks
   like just another pile of skills with unknown outcomes."
6. **Specs and documentation are conflated.** Throughout the thread "spec"
   means both the brief given to the agent and the description of what the
   system does. OpenSpec's `specs/` folder is the second thing written in the
   language of the first (SHALL, requirement IDs, delta merges).

And the thesis this plan builds on: **specs and user stories are inputs to
development; features and documentation are its outputs.** The manual outlives
the brief. People who buy a washing machine want the manual, not the
instructions the engineers were given. Varar keeps the manual honest. It can be
written before the code (that is the how-to for driving a feature), but what
persists, what a reader opens, and what the runner checks is the manual.

> Attribute the washing-machine framing before it goes on the site — it comes
> from the BDD community (Matt Wynne, Seb Rose, or Gojko Adzic's "living
> documentation"); confirm the source.

## 2. Messaging decisions

Six positions, each answering a specific objection from the thread. Every page
in section 4 references them by number.

**M1. Documentation is the output; Varar keeps it honest.** The word "spec"
names an input: a story, a proposal, a task list, an OpenSpec change. Varar
does not manage inputs. An oath is documentation that describes what the
system does, in the language a reader wants, and the runner proves it still
does. Use "documentation" and "oath" on our pages; use "spec" only when
describing other tools or the input side of the loop. (Answers finding 6.)

**M2. Name both kinds of rot in the reader's words.** HN says "drift" for
"the document and the code disagree". Varar says "drift" for "a paragraph that
used to be checked no longer is". Both are real and Varar catches both, but by
different mechanisms, and a reader who arrives with the HN meaning will
misread our drift pages. Every page that says "drift" must first say:

- **The document is wrong, or the code is** — the value in the prose no longer
  matches what the software does. A failing test, anchored to the word.
- **The document is no longer checked** — a step was renamed or deleted and the
  paragraph silently became prose. Varar calls this *drift*, and fails the run
  until it is acknowledged in `varar.lock.json`.

(Answers finding 1.)

**M3. Mechanical, not judged.** No language model sits in the verification
loop. A sensor returns what the software did; the core compares it to the
cell; the failure is a span in the document. Say this explicitly, once per
entry page. Contrast with LLM-judged verification without naming vendors:
"an LLM that searches the code for evidence a scenario is covered can be
satisfied by code that looks right". (Answers finding 2.)

**M4. Small by design.** A healthy project has many more unit tests than
oaths, and one oath is a short document a person reads. The volume objection is
the sharpest hostility in the thread, and the answer already exists in
`test-anatomy` and `varar-for-cucumber-users`; it needs to be on the landing
page and in its own explanation. (Answers finding 4.)

**M5. Own the Cucumber lineage, in one sentence, first.** State it as its
creator: what was kept (concrete examples, expressions), what was dropped
(Gherkin, keywords, assertions in step bodies, a separate runner), what was
added (the value in the prose is the assertion; a paragraph that stops being
checked fails the run). Never let a commenter be the one to surface it, and
never claim kinship with tools that were not an influence. (Answers the
lineage risk.)

**M6. Show the evidence.** Dogfooding (the repo's own oaths run in CI), the
conformance corpus across eight ports, the adapter smoke contract that fails a
port whose gate is wired but not armed. These are the "how and why it works"
a sceptic asked for. One page, factual. (Answers finding 5.)

Two terminology rules that follow:

- **Define "oath" in one line on every entry page** (landing, README, first
  tutorial): "an oath is a Markdown document with claims the test runner
  checks". The word is ours and will be questioned; the definition must be
  faster to find than the question.
- **Drop "specification" from our own prose** except where M1 needs the
  contrast. Today it appears on the landing page ("documentation and
  specifications"), in `no-theatre` ("every specification practice"), and in
  the llms.txt description.

## 3. Audit of the current site

Quadrant fit and verdict for every page. "Fix" is an edit; "split" moves
content to the quadrant it belongs in; "rewrite" changes the page's job.

### Entry points

| Page | Verdict | Notes |
| --- | --- | --- |
| `index.mdx` (landing) | rewrite | Hook conflates docs and specs (M1). "Oath" appears in the tagline before it is defined. Drift is mentioned only inside the Library tab, in Varar's narrow sense (M2). No mention of M3, M4 or M6. `no-theatre`, the strongest page for this audience, is not linked. |
| repo `README.md` | rewrite | Says five ports shipped and three in progress; all eight ship. Carries none of M1–M6. HN clicks the repo link first. |
| llms.txt description (`astro.config.mjs`) | fix | "the prose IS the source of truth" is fine; add M2 and M3 in one sentence each. Agents are a first-class audience and this is what they read first. |

### Tutorials (learning by doing)

| Page | Fit | Verdict | Notes |
| --- | --- | --- | --- |
| `try-varar` | tutorial | keep | Good. Add one line defining "oath" at the top. |
| `get-started` | tutorial | fix | Says "Run oaths through vitest instead of the CLI"; `varar run` was removed (ADR 0015). Step 4's "Run it" is already the test runner; fix the Next section and the "Ports with a `varar` CLI" phrasing (init only). |
| `first-oath` | tutorial | keep | Good. |
| *(missing)* | tutorial | **new** | A drift tutorial. See T1 in section 4. |

### How-to guides (goal-oriented)

| Page | Fit | Verdict | Notes |
| --- | --- | --- | --- |
| `tables-and-doc-strings` | how-to | keep | Good. |
| `run-with-vitest` | how-to | fix | "instead of (or alongside) the `varar` CLI" is stale. Keep the "Accept drift" section but link it to the new drift reference (R1). |
| `agent-instructions` | how-to | keep | Good. Add one line to the pasted block: "an oath is documentation; write it for the reader, not for the test". |
| `drive-a-feature-with-an-agent` | how-to, with explanation mixed in | fix | Move "What the tooling catches — and what needs your eyes" into the new drift explanation (E2) and link to it. Keep the loop. |
| `share-setup-between-examples` | how-to (draft) | keep | Ships with its feature. |
| *(missing)* | how-to | **new** | Adopt Varar in an existing codebase (H1). |
| *(missing)* | how-to | **new** | Use Varar with a spec-driven workflow (H2). |
| *(missing)* | how-to | **new** | Review an oath change (H3). |
| *(missing)* | how-to | **new** | Migrate from Cucumber (H4, split out of the explanation page). |

### Reference (facts, lookup)

| Page | Fit | Verdict | Notes |
| --- | --- | --- | --- |
| `examples` | reference, with explanation mixed in | split | The "Drift detection" section is a third of the page and its "Why it's important" subsection is explanation. Move drift to its own reference page (R1) and the why to E2. Keep a two-line pointer. |
| `configuration` | reference | keep | Mentions "the `varar` CLI" reading the config; true for `init`/`lint`, fine. |
| `stimuli` | reference | keep | Good. |
| `sensors` | reference | keep | Good. The Harness Engineering etymology and "Why an array at all?" are explanation, but short; leave. |
| `custom-parameters` | reference | keep | Good. |
| `editor-support` | reference | fix | Lists a **Missing steps** diagnostic. `examples.mdx` says there is "no 'missing step' inference from sentence shape" and `lint.md` says it never flags an unmatched sentence. Establish which is true and make the three pages agree. |
| `run-results` | reference | keep | The "Drift baseline" section moves to R1 with a pointer left behind. |
| `lint` | reference | keep | Good; already draws the drift/lint distinction well. |
| `example-projects` | reference | keep | Check the "synced once registry publishing goes live" note for Rust, C# and Go is still current. |
| *(missing)* | reference | **new** | Drift and the baseline (R1). |
| *(missing)* | reference | **new** | Vocabulary (R2). |

### Explanation (understanding)

| Page | Fit | Verdict | Notes |
| --- | --- | --- | --- |
| `varar-overview` | explanation | fix | It is the cell model, not an overview. Rename to "Cells: the spreadsheet model" and let E1 be the overview. |
| `oaths` | stub (three sentences) | rewrite | Becomes the definition page for the word, or folds into R2. Today it only says the term was chosen for convenience, which is the weakest possible answer to "why not just say spec". |
| `test-anatomy` | explanation | keep | Good. Already carries "A healthy codebase has many more unit tests than Varar examples" (M4); link from E3. |
| `thin-steps` | stub with a TODO | rewrite | Must be finished before launch. "Step definitions become a second implementation" is the most durable Cucumber objection on HN and this is the page that answers it. |
| `markup-is-yours` | explanation | keep | Good. |
| `no-theatre` | explanation | fix | Best page for this audience. Add M3 explicitly (the LLM-judge contrast). Replace "every specification practice" with "every documentation practice" (M1). Link from the landing page. |
| `varar-for-cucumber-users` | explanation + how-to | split | The "Migrating from Cucumber" section is a how-to (H4). The rest stays and gains the M5 framing at the top: kept, dropped, and why. |
| `reuse` | explanation (draft) | keep | Ships with its feature. |
| *(missing)* | explanation | **new** | Documentation is the output (E1). |
| *(missing)* | explanation | **new** | Two kinds of rot (E2). |
| *(missing)* | explanation | **new** | An oath is small (E3). |
| *(missing)* | explanation | **new** | Varar and spec-driven development (E4). |
| *(missing)* | explanation | **new** | How Varar is tested (E5). |

## 4. New pages

Each brief names its quadrant, the messaging decisions it carries, and the
thread objection it answers.

### T1. Tutorial: Watch drift get caught

Continues from `first-oath`. Rename the `evaluate to {int}` sensor in the steps
file to `evaluates to {int}`, run, and read the failure: the paragraph still
reads like documentation, still renders, but nothing checks it any more, and
the run is red. Restore the step, run green. Then rename it on purpose,
accept with `VARAR_UPDATE=1`, and look at the `varar.lock.json` diff. End with
what was learned: a document can stop being checked, but never silently.
Carries M2. Answers "the spec almost immediately becomes out of date".

### H1. How-to: Adopt Varar in an existing codebase

OpenSpec is "brownfield-first" and Varar has no onboarding story. Steps: pick
one claim the README already makes; turn it into a paragraph with a concrete
value; write the one sensor; run; commit the oath and the lock file. Then the
two rules for growing: write an oath from the next bug report, not from the
codebase; stop when a reader can tell what the system does. Include the
warning that a paragraph which has never matched gets no drift protection,
so watch the runner report the example count on the first run. Carries M4.

### H2. How-to: Use Varar with a spec-driven workflow

For readers who use OpenSpec, spec-kit or a plan file. The proposal, design and
task list stay as inputs. The scenario's concrete values become an oath, which
is the output. The agent implements against the oath and the runner, not
against a verify prompt. Show one OpenSpec scenario (`#### Scenario:` with
GIVEN/WHEN/THEN bullets) and the oath it becomes, and note that list items are
matchable so the scenario can stay where it is if it carries concrete values.
Carries M1 and M3. Answers the whole thread.

### H3. How-to: Review an oath change

Written for the reviewer of a pull request. What to read in the oath diff
("did what we promise change?"), what a `varar.lock.json` change means (an
accepted drift; ask why it was accepted rather than restored), and the three
edits no tool can catch: a value edited to whatever the code produced, an
example deleted, an example that claims nothing. Most of this text exists in
`drive-a-feature-with-an-agent`; this page gives it to the reviewer rather
than the author. Carries M4. Answers "how do I review so many files".

### H4. How-to: Migrate from Cucumber

The "Migrating from Cucumber" section of the explanation page, moved. Steps
plus the mapping table (Scenario → example, Outline → header-bound table,
Background → reference block).

### R1. Reference: Drift and the baseline

One page for what is now spread across `examples`, `run-results`,
`run-with-vitest` and `editor-support`: the definition, what triggers it,
re-identification by text similarity, the `varar.lock.json` shape, the accept
commands per runner, pruning, the reference-block asymmetry, and what is not
drift (file deletion, dangling references). Opens with the M2 disambiguation.

### R2. Reference: Vocabulary

One table: oath, example, prose, step, stimulus, sensor, cell, slot,
header-bound table, doc string, reference block, drift, baseline, run result.
One line each, linking to the page that owns the term. The `oaths` stub
becomes the "oath" row plus one paragraph on the name.

### E1. Explanation: Documentation is the output

The thesis of section 1, as a page. Inputs and outputs of development; the
washing machine; why the manual is the artefact worth keeping honest; why
Varar checks documentation and manages no proposals, tasks or deltas; how an
oath written before the code is still the manual, not the brief. Becomes the
first page under "Understanding Varar". Carries M1.

### E2. Explanation: Two kinds of rot

The M2 disambiguation at length. The value disagrees (a failing test, anchored
to the word) versus the check is gone (drift, held until acknowledged). Why
the second is worse: it looks exactly like success. Why an LLM judge does not
close either gap (M3): it can be satisfied by code that looks right, and it
detects divergence without preventing it. Absorbs the "Why it's important"
subsection from `examples` and "What the tooling catches" from
`drive-a-feature-with-an-agent`.

### E3. Explanation: An oath is small

The volume answer. A few oaths that illustrate, many unit tests that
enumerate; an oath is a document a person reads in one sitting; the review
unit is the oath diff, not a folder of generated files. Links `test-anatomy`
and `thin-steps`. Carries M4.

### E4. Explanation: Varar and spec-driven development

Factual comparison with OpenSpec, spec-kit and Kiro as a family: they manage
the input side (agree before building), Varar checks the output side (prove it
still does what the docs say), and they compose. A short table: artefact,
enforcement, drift handling, what runs. No vendor criticism beyond what their
own docs say. Carries M1 and M3.

### E5. Explanation: How Varar is tested

The evidence page (M6): the repo's own oaths run in CI; the conformance
corpus that every port parses and asserts against; the adapter smoke contract
that failed the .NET port when its drift gate was wired but not armed; the
run-result contract. Short, with links into the repo.

## 5. Fixes that do not wait for the plan

Land these first, each as its own commit; they are wrong today.

- `get-started` and `run-with-vitest`: remove the `varar run` / "instead of
  the CLI" references (ADR 0015).
- `editor-support` versus `examples` and `lint`: the "Missing steps"
  diagnostic contradiction. Check what the language server actually publishes
  and make the three pages agree.
- `README.md`: eight ports ship, not five plus three.
- `thin-steps`: the page is a TODO on a public site.
- `example-projects`: confirm the registry-publishing note for Rust, C# and Go.

## 6. Sidebar after the changes

```
Start here
  Try Varar in your browser
  Get started on your computer
  Your first oath from scratch
  Watch drift get caught                      (T1)
How-to guides
  Adopt Varar in an existing codebase         (H1)
  Drive a feature with an agent
  Wire Varar into your agent's instructions
  Use Varar with a spec-driven workflow       (H2)
  Review an oath change                       (H3)
  Check tables and doc strings
  Share setup between examples
  Run oaths through vitest
  Migrate from Cucumber                       (H4)
Reference
  Vocabulary                                  (R2)
  Examples
  Drift and the baseline                      (R1)
  varar.config.json
  Stimuli
  Sensors
  Custom parameters
  Editor support
  Run results
  varar lint
  Example projects
Understanding Varar
  Documentation is the output                 (E1)
  Two kinds of rot                            (E2)
  Oaths that can't be theatre
  An oath is small                            (E3)
  Cells: the spreadsheet model                (renamed varar-overview)
  Test anatomy
  Thin steps
  The markup is yours
  Reuse is a link
  Varar and spec-driven development           (E4)
  Varar for Cucumber users
  How Varar is tested                         (E5)
```

Redirects for `explanation/varar-overview` and `explanation/oaths` go in
`astro.config.mjs` next to the existing rename redirects.

## 7. Sequencing

Four phases, each shippable on its own. The site deploys from every push to
`main`, so new pages for unreleased features carry `draft: true`; none of the
pages above document unreleased behaviour, so none need it.

| Phase | Scope | Why this order |
| --- | --- | --- |
| 0. Correct | Section 5 | Wrong today. Small, independent commits. |
| 1. Message | Landing, README, llms.txt description, E1, E2, `no-theatre` edits, R2 | The pages a Show HN reader hits in the first two minutes. |
| 2. Drift | T1, R1, `examples` split, `run-results` pointer, `run-with-vitest` link | The feature the audience cares about, in one place per quadrant. |
| 3. Fit | E3, E4, E5, H1, H2, H3 | The objections: volume, category, evidence, brownfield, composition, review. |
| 4. Tidy | H4 split, `thin-steps`, `varar-overview` rename, `drive-a-feature` trim | Cleanup that improves the site but would not change a first impression. |

Phases 0 and 1 are the minimum before posting. Phase 2 should be there too,
because the first question in the thread will be about drift. Phases 3 and 4
can land during the week after.

## 8. Show HN notes

- **Link target:** the landing page, once phase 1 has landed. Not the repo;
  the README is the second click and must agree with the landing page.
- **Title shape:** lead with the mechanism, not the lineage. "Show HN: Varar –
  Markdown docs that fail your build when the code stops doing what they say".
  Do not put Cucumber in the title.
- **First comment (yours):** M5 in four sentences. Built Cucumber; what was
  kept (concrete examples, expressions); what was dropped (Gherkin, keywords,
  assertions in step bodies, a separate runner); what was added (the value in
  the prose is the assertion; a paragraph that stops being checked fails the
  run). Then the "small by design" line.
- **Answers to keep ready:** "why not an LLM judge" (E2), "how many of these
  do I write" (E3), "does it replace OpenSpec" (E4, no, it composes), "what
  about steps being a second implementation" (`thin-steps`), "why call it an
  oath" (R2).
- **Do not do:** post while `thin-steps` is a TODO; link-drop in someone
  else's thread; reply to the Cucumber objection defensively. The
  cucumber-users page already takes the complaints seriously; link it.
