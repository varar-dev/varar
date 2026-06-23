import { gherkinDocStrings, gherkinTables } from '@oselvar/var'

export default {
  vars: ['features/**/*.var.md'],
  steps: ['steps/**/*.steps.ts'],
  // Opt into Gherkin syntax so the symlinked `library.feature.var.md` (a
  // real Gherkin file) parses with the same shape both runners expect:
  // pipe-row tables without a `|---|` separator and `"""` doc strings.
  scannerPlugins: [gherkinTables(), gherkinDocStrings()],
}
