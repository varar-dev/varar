// Role-aware TypeScript snippet. Variables:
//   {{role}}         — the active role: stimulus | sensor
//   {{alt}}          — the non-active role (for a commented alternative)
//   {{expression}}   — the cucumber expression, e.g. `I have {int} cukes`
//   {{args}}         — formatted handler args, e.g. `state, count: number`
//   {{originalText}} — the raw input the user typed
export const DEFAULT_SNIPPET_TEMPLATE = `// {{alt}}('{{expression}}', ({{args}}) => {})
{{role}}('{{expression}}', ({{args}}) => {
  // Write code here that turns the phrase above into concrete actions
  throw new Error('not implemented')
})
`

// Python: decorated def. {{args}} arrives pre-rendered ('state, count: int').
export const PYTHON_SNIPPET_TEMPLATE = `# @{{alt}}("{{expression}}")
@{{role}}("{{expression}}")
def _({{args}}):
    # Write code here that turns the phrase above into concrete actions
    raise NotImplementedError("not implemented")
`

// Java: binder call on the conventional 's' StateBinder variable. {{args}}
// arrives pre-rendered ('Ctx ctx, Integer count').
export const JAVA_SNIPPET_TEMPLATE = `// s.{{alt}}("{{expression}}", ({{args}}) -> { ... })
s.{{role}}(
        "{{expression}}",
        ({{args}}) -> {
            // Write code here that turns the phrase above into concrete actions
            throw new UnsupportedOperationException("not implemented");
        });
`

// Kotlin: trailing lambda; state is the receiver, so params are user-only.
// {{lambdaParams}} is 'count: Int ->' or '' (zero-capture step).
export const KOTLIN_SNIPPET_TEMPLATE = `// {{alt}}("{{expression}}") { {{lambdaParams}} ... }
{{role}}("{{expression}}") { {{lambdaParams}}
    // Write code here that turns the phrase above into concrete actions
    TODO("not implemented")
}
`
