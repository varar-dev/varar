import { defineState } from '@oselvar/var'

const { sensor } = defineState(() => ({}))

// The doc string is this sensor's only slot, so it is returned bare; the core
// compares it against the input (compareDocString); equal content passes.
sensor('I echo the following:', (_ctx, doc: string) => doc)
