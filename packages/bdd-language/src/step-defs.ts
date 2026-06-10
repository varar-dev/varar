import * as ts from 'typescript'

export type Position = { readonly line: number; readonly character: number }
export type Range = { readonly start: Position; readonly end: Position }

export type StepDef = {
  readonly file: string
  readonly expression: string
  readonly expressionRange: Range
  readonly callRange: Range
}

export function discoverStepDefs(file: string, source: string): ReadonlyArray<StepDef> {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, true)
  const out: StepDef[] = []
  visit(sf, sf, out, file)
  return out
}

function visit(sf: ts.SourceFile, node: ts.Node, out: StepDef[], file: string): void {
  if (ts.isCallExpression(node) && isStepCall(node) && node.arguments.length >= 1) {
    const arg0 = node.arguments[0]
    if (arg0 && ts.isStringLiteral(arg0)) {
      out.push({
        file,
        expression: arg0.text,
        expressionRange: rangeOf(sf, arg0),
        callRange: rangeOf(sf, node),
      })
    }
  }
  ts.forEachChild(node, (child) => visit(sf, child, out, file))
}

function isStepCall(node: ts.CallExpression): boolean {
  // Match `step(...)` regardless of whether `step` came from an import or a
  // destructured `defineContext(...)` return. We accept any bare identifier
  // named `step`. False positives from shadowed locals are filtered out by
  // the test in Step 1 — function declarations, properties, and comments are
  // not CallExpressions.
  return ts.isIdentifier(node.expression) && node.expression.text === 'step'
}

function rangeOf(sf: ts.SourceFile, node: ts.Node): Range {
  const start = sf.getLineAndCharacterOfPosition(node.getStart(sf))
  const end = sf.getLineAndCharacterOfPosition(node.getEnd())
  return {
    start: { line: start.line + 1, character: start.character + 1 },
    end: { line: end.line + 1, character: end.character + 1 },
  }
}
