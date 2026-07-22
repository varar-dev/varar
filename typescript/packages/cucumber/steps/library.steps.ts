import { steps } from '@varar/varar'
import { type Book, type BorrowError, Library, type Receipt } from '../src/library.ts'

const { stimulus, sensor } = steps(() => ({
  library: new Library(new Date('2026-06-12T00:00:00Z')),
  lastReceipt: undefined as Receipt | BorrowError | undefined,
}))

stimulus('the library has these books:', (state, rows: ReadonlyArray<ReadonlyArray<string>>) => {
  const [header, ...body] = rows
  if (!header) return
  const books = body.map((row) =>
    Object.fromEntries(header.map((h, i) => [h, row[i] ?? ''])),
  ) as Book[]
  // `library` is a live class instance, so this side effect on its internal
  // shelf is allowed. The step returns nothing.
  state.library.addBooks(books)
})

stimulus('the member borrows {string}', (state, title: string) => ({
  ...state,
  lastReceipt: state.library.borrow(title),
}))

// The doc string is this sensor's only slot, so it returns the receipt for the
// core to compare against the document (doc strings compare exactly, trailing
// newline included) rather than asserting by hand.
sensor('the receipt is:', (state) => `${JSON.stringify(state.lastReceipt)}\n`)
