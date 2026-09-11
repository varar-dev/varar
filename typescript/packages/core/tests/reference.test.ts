import { expect, test } from 'vitest'
import { parse } from '../src/parse.ts'
import { plan } from '../src/plan.ts'
import { buildWorkspace, emptyWorkspace, references, slugify } from '../src/reference.ts'
import { addStep, createRegistry, type Registry } from '../src/registry.ts'

// Reuse is a link (ADR 0016): a block whose entire content is a link to an oath
// section splices that section's steps in at its own position.

function reg(): Registry {
  let r = createRegistry()
  for (const expression of [
    'The library holds {string}',
    'Fees are enabled',
    'Maya borrows {string}',
    'She owes {string}',
    'The nightly batch runs',
  ]) {
    r = addStep(r, {
      expression,
      expressionSourceFile: 'steps.ts',
      expressionSourceLine: 1,
      kind: expression.startsWith('She owes') ? 'sensor' : 'stimulus',
      handler: () => {},
    })
  }
  return r
}

const SHARED = `# Shared

## A stocked library

The library holds "Dune".

## Fees are enabled

Fees are enabled.
`

function planWith(main: string, shared = SHARED) {
  const docs = [parse('varar/fees.md', main), parse('varar/shared.md', shared)]
  const workspace = buildWorkspace(docs)
  return {
    main: plan(docs[0]!, reg(), workspace),
    shared: plan(docs[1]!, reg(), workspace),
  }
}

test('a link-only paragraph splices the referenced section into the example', () => {
  const { main } = planWith(`# Late fees

[A stocked library](./shared.md#a-stocked-library)

Maya borrows "Emma". She owes "£2.50".
`)

  expect(main.examples).toHaveLength(1)
  expect(main.examples[0]?.steps.map((s) => s.text)).toEqual([
    'The library holds "Dune"',
    'Maya borrows "Emma"',
    'She owes "£2.50"',
  ])
})

test('the example is named by its own first matching paragraph, not the link', () => {
  const { main } = planWith(`# Late fees

[A stocked library](./shared.md#a-stocked-library)

Maya borrows "Emma".
`)

  expect(main.examples[0]?.name).toBe('Maya borrows "Emma"')
})

test('a spliced step carries the document its spans belong to', () => {
  const { main } = planWith(`[A stocked library](./shared.md#a-stocked-library)

Maya borrows "Emma".
`)

  const [spliced, own] = main.examples[0]?.steps ?? []
  expect(spliced?.docPath).toBe('varar/shared.md')
  expect(own?.docPath).toBeUndefined()
})

test('a referenced section stops being a standalone example', () => {
  const { shared } = planWith(`[A stocked library](./shared.md#a-stocked-library)

Maya borrows "Emma".
`)

  // "Fees are enabled" is untouched; the consumed section is gone.
  expect(shared.examples.map((e) => e.name)).toEqual(['Fees are enabled'])
})

test('a reference can appear mid-example, sharing the same state', () => {
  const { main } = planWith(`Maya borrows "Emma".

[Fees are enabled](./shared.md#fees-are-enabled)

She owes "£2.50".
`)

  expect(main.examples).toHaveLength(1)
  expect(main.examples[0]?.steps.map((s) => s.text)).toEqual([
    'Maya borrows "Emma"',
    'Fees are enabled',
    'She owes "£2.50"',
  ])
})

test('a same-file reference resolves against the document being planned', () => {
  const source = `# Setup

## Groundwork

Fees are enabled.

# Late fees

[Groundwork](#groundwork)

Maya borrows "Emma".
`
  const doc = parse('varar/one.md', source)
  const p = plan(doc, reg(), buildWorkspace([doc]))

  expect(p.examples).toHaveLength(1)
  expect(p.examples[0]?.steps.map((s) => s.text)).toEqual([
    'Fees are enabled',
    'Maya borrows "Emma"',
  ])
})

test('a blockquote or list item spells the same reference', () => {
  const quoted = planWith(`> [A stocked library](./shared.md#a-stocked-library)

Maya borrows "Emma".
`).main
  const listed = planWith(`- [A stocked library](./shared.md#a-stocked-library)

Maya borrows "Emma".
`).main

  expect(quoted.examples[0]?.steps).toHaveLength(2)
  expect(listed.examples[0]?.steps).toHaveLength(2)
})

test('references nest to any depth', () => {
  const shared = `# Shared

## Base

Fees are enabled.

## A stocked library

[Base](#base)

The library holds "Dune".
`
  const { main } = planWith(
    `[A stocked library](./shared.md#a-stocked-library)

Maya borrows "Emma".
`,
    shared,
  )

  expect(main.examples[0]?.steps.map((s) => s.text)).toEqual([
    'Fees are enabled',
    'The library holds "Dune"',
    'Maya borrows "Emma"',
  ])
})

test('a reference cycle is reported, not recursed into', () => {
  const shared = `# Shared

## A

[B](#b)

Fees are enabled.

## B

[A](#a)

The library holds "Dune".
`
  const { main } = planWith(
    `[A](./shared.md#a)

Maya borrows "Emma".
`,
    shared,
  )

  expect(main.diagnostics.map((d) => d.code)).toContain('reference-cycle')
})

test('a link to a document the workspace does not hold is an error, not prose', () => {
  const { main } = planWith(`[Missing](./nope.md#anything)

Maya borrows "Emma".
`)

  const diagnostic = main.diagnostics.find((d) => d.code === 'reference-not-found')
  expect(diagnostic?.message).toContain('varar/nope.md')
})

test('a link whose section contributes no steps is an error', () => {
  const { main } = planWith(`[Typo](./shared.md#a-stoked-library)

Maya borrows "Emma".
`)

  expect(main.diagnostics.map((d) => d.code)).toContain('reference-empty')
})

test('a link-only paragraph with any other target stays prose', () => {
  const source = `[the docs](https://varar.dev/reference/examples/)

Maya borrows "Emma".
`
  const doc = parse('varar/fees.md', source)
  const p = plan(doc, reg(), emptyWorkspace())

  expect(references(doc)).toEqual([])
  expect(p.diagnostics).toEqual([])
  expect(p.examples).toHaveLength(1)
})

test('a link inside a sentence is content, not a reference', () => {
  const doc = parse(
    'varar/fees.md',
    'See [A stocked library](./shared.md#a-stocked-library) first.\n',
  )
  expect(references(doc)).toEqual([])
})

test('references() resolves targets against the referring document', () => {
  const doc = parse('varar/deep/fees.md', '[Up](../shared.md#a-stocked-library)\n')
  expect(references(doc)).toEqual([
    { path: 'varar/shared.md', slug: 'a-stocked-library', text: 'Up' },
  ])
})

test('slugs follow GitHub: inline markup dropped, punctuation stripped', () => {
  expect(slugify('A *stocked* library')).toBe('a-stocked-library')
  expect(slugify('Fees, VAT & rounding!')).toBe('fees-vat--rounding')
  expect(slugify('`code` spans')).toBe('code-spans')
})
