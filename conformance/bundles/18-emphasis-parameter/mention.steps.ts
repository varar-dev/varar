import { steps } from '@varar/varar'

// {emph} is a built-in parameter type: Markdown emphasis, with only the inner
// text passed to the handler. Matching is what conformance pins here.
const { stimulus } = steps(() => ({}))

stimulus('I mention {emph}', () => {})
