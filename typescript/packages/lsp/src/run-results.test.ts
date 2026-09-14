import { hashSource, type OathResults } from '@varar/core'
import { describe, expect, it } from 'vitest'
import { createRunResultsStore, runLspDiagnostics } from './run-results.ts'

const SOURCE = 'x 6 y'
const OATH: OathResults = {
  version: 2,
  oathPath: 'docs/a.md',
  sourceHash: hashSource(SOURCE),
  examples: [
    {
      name: 'r',
      status: 'failed',
      lines: [1],
      failure: { line: 1, message: 'm', stack: 's', cells: [{ from: 2, to: 3, actual: '50' }] },
    },
  ],
}

describe('runLspDiagnostics', () => {
  it('maps run diagnostics to 0-based LSP diagnostics tagged source: var, severity error', () => {
    expect(runLspDiagnostics(OATH, SOURCE)).toEqual([
      {
        severity: 1,
        source: 'var',
        message: 'expected 6 but was 50',
        range: { start: { line: 0, character: 2 }, end: { line: 0, character: 3 } },
      },
    ])
  })

  it('returns nothing when the source no longer hash-matches (stale)', () => {
    expect(runLspDiagnostics(OATH, `${SOURCE} edited`)).toEqual([])
  })
})

describe('RunResultsStore', () => {
  it('ingests a valid .varar json and keys it by the oath file URI', () => {
    const store = createRunResultsStore('file:///root')
    const uris = store.ingest('/root/.varar/docs/a.md.json', JSON.stringify(OATH))
    expect(uris).toEqual(['file:///root/docs/a.md'])
    expect(store.get('file:///root/docs/a.md')).toEqual(OATH)
    expect(store.oathUris()).toEqual(['file:///root/docs/a.md'])
  })

  it('rejects malformed JSON and a wrong version (stores nothing)', () => {
    const store = createRunResultsStore('file:///root')
    expect(store.ingest('/root/.varar/x.json', 'not json')).toEqual([])
    expect(
      store.ingest(
        '/root/.varar/x.json',
        JSON.stringify({ version: 99, oathPath: 'x', sourceHash: 'h', examples: [] }),
      ),
    ).toEqual([])
    expect(store.oathUris()).toEqual([])
  })

  it('remove() drops the entry and returns its oath URI', () => {
    const store = createRunResultsStore('file:///root')
    store.ingest('/root/.varar/docs/a.md.json', JSON.stringify(OATH))
    expect(store.remove('/root/.varar/docs/a.md.json')).toEqual(['file:///root/docs/a.md'])
    expect(store.get('file:///root/docs/a.md')).toBeUndefined()
  })
})

// ADR 0016: a failure inside a section another oath referenced belongs to the
// document it was WRITTEN in, not the oath that ran it.
describe('a failure spliced in from another oath', () => {
  const SHARED = 'shelve 3 books'
  const REFERRING: OathResults = {
    version: 2,
    oathPath: 'varar/fees.md',
    sourceHash: hashSource('the fee is 50p'),
    documents: [{ path: 'varar/shared.md', sourceHash: hashSource(SHARED) }],
    examples: [
      {
        name: 'the fee is 50p',
        status: 'failed',
        lines: [1],
        failure: {
          line: 1,
          message: 'boom',
          stack: 's',
          anchor: { from: 0, to: 6 },
          docPath: 'varar/shared.md',
        },
      },
    ],
  }

  it('is not projected onto the oath that ran it', () => {
    expect(runLspDiagnostics(REFERRING, 'the fee is 50p')).toEqual([])
  })

  it('is projected onto the document it was written in', () => {
    const [d] = runLspDiagnostics(REFERRING, SHARED, 'varar/shared.md')
    expect(d?.message).toBe('boom')
    expect(d?.range.start).toEqual({ line: 0, character: 0 })
  })

  it('is dropped when that document has moved on', () => {
    expect(runLspDiagnostics(REFERRING, 'shelve 4 books', 'varar/shared.md')).toEqual([])
  })

  it('reaches the shared oath through the store, which has no result of its own', () => {
    const store = createRunResultsStore('file:///w')
    store.ingest('/w/.varar/varar/fees.md.json', JSON.stringify(REFERRING))

    expect(store.get('file:///w/varar/shared.md')).toBeUndefined()
    expect(store.resultsFor('file:///w/varar/shared.md')).toEqual([
      { results: REFERRING, forDocument: 'varar/shared.md' },
    ])
    expect(store.oathUris()).toContain('file:///w/varar/shared.md')
  })
})

// A result file speaks for the documents its steps came from as well as for
// its oath, so the server must republish each of them when it changes — and a
// document the previous record named must be cleared when the new one drops it.
describe('RunResultsStore: which URIs a result change affects', () => {
  const REFERRING: OathResults = {
    version: 2,
    oathPath: 'varar/fees.md',
    sourceHash: hashSource('the fee is 50p'),
    documents: [{ path: 'varar/shared.md', sourceHash: hashSource('shelve 3 books') }],
    examples: [],
  }

  it('ingest() names the oath and every document the record (and the one it replaces) names', () => {
    const store = createRunResultsStore('file:///w')
    expect(store.ingest('/w/.varar/varar/fees.md.json', JSON.stringify(REFERRING))).toEqual([
      'file:///w/varar/fees.md',
      'file:///w/varar/shared.md',
    ])
    // A clean rerun with the reference removed: shared.md still needs its
    // stale squiggle cleared, so it is still reported as affected.
    const withoutReference = { ...REFERRING, documents: [] }
    expect(store.ingest('/w/.varar/varar/fees.md.json', JSON.stringify(withoutReference))).toEqual([
      'file:///w/varar/fees.md',
      'file:///w/varar/shared.md',
    ])
    // And once nothing names it, only the oath itself is affected.
    expect(store.ingest('/w/.varar/varar/fees.md.json', JSON.stringify(withoutReference))).toEqual([
      'file:///w/varar/fees.md',
    ])
  })

  it('remove() names the oath and every document the removed record named', () => {
    const store = createRunResultsStore('file:///w')
    store.ingest('/w/.varar/varar/fees.md.json', JSON.stringify(REFERRING))
    expect(store.remove('/w/.varar/varar/fees.md.json')).toEqual([
      'file:///w/varar/fees.md',
      'file:///w/varar/shared.md',
    ])
    expect(store.remove('/w/.varar/varar/fees.md.json')).toEqual([])
  })
})
