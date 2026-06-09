import { defineWorkspace } from 'vitest/config'

export default defineWorkspace(['packages/*/vitest.config.ts', 'docs/tutorial/vitest.config.ts'])
