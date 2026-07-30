import { EditorView } from '@codemirror/view'

// A matched step reads as bold ink — no fill — with each captured parameter
// drawn as a single rounded chip. A chip means "this text was captured by a
// step", which stays true whether the example passed or failed, so a failing
// example keeps every chip at its normal colour: only the mismatched value
// (wrapped by the lint range) turns vermillion. The line wash already says
// the example failed; muting the correct parameters as well only hid
// information that is still accurate.

// @codemirror/lint draws its squiggle as a background-image on the wrapping
// span.cm-lintRange — an opaque chip INSIDE that wrapper paints right over
// it. Re-draw the identical tile (lint's underline("#f11") path and colour,
// so the squiggle stays one colour where the wrapper peeks out past the
// chip) on the token itself, above its background fill.
const errorSquiggle = `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="6" height="3">${encodeURIComponent('<path d="m0 2.5 l2 -1.5 l1 0 l2 1.5 l1 0" stroke="#f11" fill="none" stroke-width=".7"/>')}</svg>')`

export const varTokenTheme = EditorView.baseTheme({
  '.cm-token-function': {
    fontWeight: '600',
  },
  '.cm-token-parameter': {
    // Step teal pulled toward the editor background: lighter in light mode,
    // darker in dark mode — either way it keeps AA contrast under the same
    // ink the step text uses.
    background: 'color-mix(in srgb, var(--ed-step-bg) 55%, var(--ed-bg))',
    color: 'inherit', // same ink as the step text around it
    borderRadius: '4px',
    // No horizontal padding: the chip is exactly as wide as its text, so
    // caret movement around it stays one glyph per step.
    padding: '1px 0',
    fontWeight: '600',
  },
  // The mismatched value itself: a lightened vermillion chip (--ed-fail-mark
  // is the Okabe–Ito colorblind-safe fail colour in both themes; the 25%
  // white mix lifts text contrast) with dark ink and the red squiggle
  // layered above its fill. Two classes deep, so it out-specifies the plain
  // chip above by class count, not by rule order. No .cm-run-fail scope: an
  // error squiggle sitting on a *matched* token is a run's cell mismatch by
  // construction (drift is a warning, and a parse error means the step never
  // matched, so there's no token under it).
  '.cm-lintRange-error .cm-token-function, .cm-lintRange-error .cm-token-parameter': {
    background: 'color-mix(in srgb, var(--ed-fail-mark) 65%, white)',
    color: '#17120d',
    backgroundImage: errorSquiggle,
    backgroundRepeat: 'repeat-x',
    backgroundPosition: 'left bottom',
  },
})
