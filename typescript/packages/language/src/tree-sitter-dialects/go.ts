import type { Node } from 'web-tree-sitter'
import type { HandlerParams } from '../step-defs.ts'
import type { LanguageSpec } from './types.ts'

// Verified against tree-sitter-go 0.25.0 and all 15 conformance bundles
// (2026-07-19). Go authors steps through the `varar.Steps` builder, so a step
// def is a method call `s.Stimulus(...)` / `s.Sensor(...)` — the method name is
// the kind (the scanner lower-cases it), matching every other port. The
// expression is the FIRST string argument (anchored with `.`), so string
// literals inside the handler closure are never mistaken for it; the
// `NewSteps`/`FromRegistry`/`Registry` calls have other names, excluded by the
// #match filter.
// Two forms, both matched. The explicit builder method puts the expression
// first:
//
//	s.Sensor("the total is {int}", func(state varar.Value, args []varar.Value) …)
//
// The generic typed constructor is a package-level function — Go allows no type
// parameters on methods — so the builder is the first argument and the
// expression the second, and the arity rides in the name:
//
//	varar.Sensor2(s, "The square of {int} is {int}.", func(state varar.Value, n, square int) …)
//
// `normalizeKind` below strips that trailing digit, so both yield sensor/stimulus.
const STEP_DEFINITION_QUERY = `
(call_expression
  function: (selector_expression
    field: (field_identifier) @function-name)
  arguments: (argument_list . (interpreted_string_literal) @expression)
  (#match? @function-name "^(Stimulus|Sensor)$")
) @root

(call_expression
  function: (selector_expression
    field: (field_identifier) @function-name)
  arguments: (argument_list
    .
    (identifier)
    .
    (interpreted_string_literal) @expression
  )
  (#match? @function-name "^(Stimulus|Sensor)[0-9]+$")
) @root
`

// A custom parameter type is `s.Param("name", "regexp", …)`: name the first
// string, regexp the second — which may be a raw string (a backtick literal
// `` `£\\d+\\.\\d{2}` ``), whose backslashes are literal.
const PARAMETER_TYPE_QUERY = `
(call_expression
  function: (selector_expression
    field: (field_identifier) @function-name)
  arguments: (argument_list
    .
    (interpreted_string_literal) @name
    .
    [(interpreted_string_literal) (raw_string_literal)] @regexp-value
  )
  (#match? @function-name "^Param$")
) @root
`

const ESCAPES: Readonly<Record<string, string>> = {
  '\\': '\\',
  '"': '"',
  "'": "'",
  a: '\x07',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
  v: '\v',
}

// Decode one `escape_sequence` node's text (leading backslash included): Go
// numeric (`\xHH`, `\uHHHH`, `\UHHHHHHHH`, `\OOO` octal) and single-char escapes.
function decodeEscape(text: string): string {
  const body = text.slice(1)
  const head = body[0]
  if (head === undefined) return ''
  if (head === 'x') return String.fromCharCode(Number.parseInt(body.slice(1), 16))
  if (head === 'u') return String.fromCodePoint(Number.parseInt(body.slice(1), 16))
  if (head === 'U') return String.fromCodePoint(Number.parseInt(body.slice(1), 16))
  if (head >= '0' && head <= '7') return String.fromCharCode(Number.parseInt(body, 8))
  return ESCAPES[body] ?? body
}

// interpreted_string_literal carries its text in `interpreted_string_literal_content`
// children with `escape_sequence` siblings for escapes; raw_string_literal carries
// `raw_string_literal_content` verbatim (backslashes literal, no escapes). The
// delimiter tokens (`"` / backtick) are skipped.
function decodeString(node: Node): string {
  let out = ''
  for (const child of node.children) {
    if (child?.type === 'interpreted_string_literal_content') out += child.text
    else if (child?.type === 'raw_string_literal_content') out += child.text
    else if (child?.type === 'escape_sequence') out += decodeEscape(child.text)
  }
  return out
}

export const goSpec: LanguageSpec = {
  stepDefQuery: STEP_DEFINITION_QUERY,
  parameterTypeQuery: PARAMETER_TYPE_QUERY,
  decodeString,
  // Handler params (the closure arguments) aren't captured yet — Go LSP hover
  // is future work; extraction conformance only needs kind/expression/regexp.
  extractHandlerParams: (): HandlerParams | undefined => undefined,
  resolveRegexp: (node) => decodeString(node),
  // `Sensor2` -> `sensor`: the generic constructors carry their arity in the
  // name, which is not part of the kind.
  normalizeKind: (name) => name.replace(/[0-9]+$/, '').toLowerCase(),
}
