import { steps } from '@varar/varar'

const { sensor } = steps<Record<string, never>>(() => ({}))

// Two slots: the {string} capture and the trailing (non-header-bound) table.
// Both are echoed back so the core actually compares them — the table's data
// rows only, since the header row is labels and is never compared.
sensor(
  'I greet {string}',
  (_state, name: string, table: ReadonlyArray<ReadonlyArray<string>>) => [name, table.slice(1)],
)
