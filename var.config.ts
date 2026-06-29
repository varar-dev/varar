export default {
  vars: {
    include: ['docs/tutorial/**/*.md'],
    // 04-yahtzee.broken.md is a deliberately broken example; 05-roman-numerals
    // is a not-implemented "your turn" exercise. Neither must run as a spec.
    exclude: ['docs/tutorial/04-yahtzee.broken.md', 'docs/tutorial/05-roman-numerals.md'],
  },
  steps: ['docs/tutorial/**/*.steps.ts'],
}
