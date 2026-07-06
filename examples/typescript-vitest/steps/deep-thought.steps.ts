import { defineState } from '@oselvar/var'

const { sensor } = defineState()

sensor('life, the universe and everything is {int}', () => 42)
