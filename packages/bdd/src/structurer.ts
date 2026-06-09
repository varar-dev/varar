import type { Bdd, Block, Example, Heading } from './ast.js'
import { type Span, spanFromOffsets } from './span.js'

export function structure(path: string, source: string, blocks: ReadonlyArray<Block>): Bdd {
  const examples: Example[] = []
  let i = 0
  while (i < blocks.length) {
    const block = blocks[i]
    if (!block) {
      i++
      continue
    }
    if (block.kind !== 'heading') {
      i++
      continue
    }
    const heading: Heading = block
    const body: Block[] = []
    let j = i + 1
    while (j < blocks.length) {
      const next = blocks[j]
      if (!next) {
        j++
        continue
      }
      if (next.kind === 'heading') break
      body.push(next)
      j++
    }
    if (body.length > 0) {
      examples.push(makeExample(source, heading, body))
    }
    i = j
  }
  return { path, source, examples }
}

function makeExample(source: string, heading: Heading, body: ReadonlyArray<Block>): Example {
  const lastBody = body[body.length - 1]
  const endOffset = lastBody?.span.endOffset ?? heading.span.endOffset
  const span: Span = spanFromOffsets(source, heading.span.startOffset, endOffset)
  return {
    name: heading.text,
    span,
    headingSpan: heading.span,
    body,
  }
}
