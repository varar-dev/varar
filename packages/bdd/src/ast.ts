import type { Span } from './span.js'

export type Heading = {
  readonly kind: 'heading'
  readonly level: 1 | 2 | 3 | 4 | 5 | 6
  readonly text: string
  readonly span: Span
}

export type Paragraph = {
  readonly kind: 'paragraph'
  readonly text: string
  readonly span: Span
  readonly inlineMap: ReadonlyArray<InlineOffset>
}

export type InlineOffset = {
  readonly textOffset: number
  readonly sourceOffset: number
}

export type Block = Heading | Paragraph

export type Example = {
  readonly name: string
  readonly span: Span
  readonly headingSpan: Span
  readonly body: ReadonlyArray<Block>
}

export type Bdd = {
  readonly path: string
  readonly source: string
  readonly examples: ReadonlyArray<Example>
}
