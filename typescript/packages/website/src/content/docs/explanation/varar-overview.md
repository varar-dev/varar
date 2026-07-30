---
title: Varar overview
description: How Varar connects a document to your software, through cells.
---

Varar is an I/O layer that sits between your documentation and your software.
It connects the two with *cells* (like spreadsheet cells).

A cell can be a number, date, name etc. It can be in a paragraph of text, or in a table.

Paragraph cells are identified by *step functions*, which are functions accompanied by an expression that selects text in your document.
Table cells are identified by markdown tables in your document.

There are two kinds of cells - input and output.

## Input cells

An input cell is like a spreadsheet cell *without* a formula.
Its value is passed to a *stimulus* step function that modifies the state of the system.

## Output cells

An output cell is like a spreadsheet cell *with* a formula.
Its value is *compared* to the return value of a *sensor* step function.
If those values are different, it's an error. The document and the system disagree.

## Why this is the whole idea

A spreadsheet has no separate test suite. The formula *is* the check: put a
wrong number in a cell and the sheet is visibly wrong, immediately, in the place
you are already looking. Varar gives a Markdown document the same property. The
value in the prose isn't documentation *about* a test — it is the cell the test
compares against, so it cannot quietly drift out of date while still passing.

That is why a failure is reported *in place*: the failing cell is reddened at
its exact source span, with the value your software actually produced shown
against it. See [Editor support](/reference/editor-support/).

## Input or output is a role, not a marking

Nothing in the document marks a cell as input or output. Which one it is follows
from the step function that reads it:

- a cell read by a [stimulus](/reference/stimuli/) is an **input cell** — the
  value goes into your software;
- a cell read by a [sensor](/reference/sensors/) is an **output cell** — the
  value is compared against what your software returned.

The same `42` is an input in one sentence and an output in another. There is no
syntax to learn for the difference, which is what keeps the prose readable as
prose.

One shape holds both at once. When a paragraph names a table's column headings,
the sensor runs once per row, and each row carries its inputs and its outputs
side by side: the cells the step returns are compared, and the rest are the
inputs it was given. That is the closest Varar gets to looking like a
spreadsheet row.

## Cells and slots

A cell is the unit of *comparison*. A **slot** is the unit of *return* — one
position in what a sensor hands back.

Usually they are the same thing, but not always: a slot holds either a single
cell or a whole table of cells. A sensor with two slots — an `{int}` and a
trailing table, say — may compare a dozen cells. The
[Sensors reference](/reference/sensors/#cells-and-slots) sets out the mapping.
