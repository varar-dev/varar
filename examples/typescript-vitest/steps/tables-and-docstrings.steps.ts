import { steps } from '@varar/varar'

const { sensor } = steps()

sensor('Uppercase each one:', (_state, rows: ReadonlyArray<ReadonlyArray<string>>) => {
  return rows.slice(1).map(([before]) => ({ before, after: (before ?? '').toUpperCase() }))
})

sensor('Greet {word}:', (_state, name, _body: string) => {
  return [name, `Hello, ${name}!\n`]
})
