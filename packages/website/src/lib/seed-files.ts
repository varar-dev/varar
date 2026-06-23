export const SEED_FILES: Record<string, string> = {
  '/hello.var.md': `# Hello, Vár\n\nFirst I greet "world" okay? I think the greeting should be "Hello, world!"\n`,
  '/01-hello.steps.ts': `import { defineContext } from '@oselvar/var-vitest'\nconst { step } = defineContext(() => ({ greeting: '' }))\nstep('I greet {string}', (ctx, name: string) => {})\nstep('the greeting should be {string}', (ctx, expected: string) => {})\n`,
}
