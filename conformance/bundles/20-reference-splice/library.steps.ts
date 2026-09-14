import { steps } from '@varar/varar'

const { stimulus, sensor } = steps<{ shelf: number }>(() => ({ shelf: 0 }))

stimulus('I shelve {int} books', (state, n) => ({ shelf: state.shelf + n }))

stimulus('I borrow a book', (state) => ({ shelf: state.shelf - 1 }))

sensor('The shelf holds {int} books', (state) => state.shelf)
