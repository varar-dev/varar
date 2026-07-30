import { expectTypeOf, test } from 'vitest'
import type { Block, Doc, Example, Heading, Paragraph } from '../src/ast.ts'

test('Heading and Paragraph are members of the Block union', () => {
  expectTypeOf<Heading>().toMatchTypeOf<Block>()
  expectTypeOf<Paragraph>().toMatchTypeOf<Block>()
})

test('Heading carries level and text', () => {
  expectTypeOf<Heading>().toMatchTypeOf<{
    readonly kind: 'heading'
    readonly level: 1 | 2 | 3 | 4 | 5 | 6
    readonly text: string
  }>()
})

test('Doc has readonly examples array', () => {
  expectTypeOf<Doc['examples']>().toEqualTypeOf<ReadonlyArray<Example>>()
})
