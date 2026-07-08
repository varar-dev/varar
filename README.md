# Vár

**Executable Markdown documentation for humans and agents — turn your docs into tests.**

Vár lets you write plain-Markdown examples that read like prose, then runs them
as tests: if the code stops doing what the documentation says, the test fails.
It closes the gap where code, tests, and docs quietly drift apart — so a
programmer or coding agent that breaks the oath gets caught, every time.

📖 **Full documentation, tutorials, and a live browser playground:
[var.oselvar.com](https://var.oselvar.com)**

Vár is a multi-language project with the same behaviour across five ports —
TypeScript, Java, Kotlin, Python, and Ruby — verified by a shared,
language-neutral [conformance](conformance/) corpus.

## Coverage

Line and branch coverage per port, distilled from each tool's native report into
[`coverage.json`](coverage.json) and refreshed by `make coverage`.

<!-- coverage:start -->
| Port | Line coverage | Branch coverage |
| --- | --- | --- |
| TypeScript | ![82.5%](https://img.shields.io/badge/coverage-82.5%25-green) | ![71.4%](https://img.shields.io/badge/coverage-71.4%25-yellowgreen) |
| Java / Kotlin | ![86.2%](https://img.shields.io/badge/coverage-86.2%25-green) | ![76.8%](https://img.shields.io/badge/coverage-76.8%25-yellowgreen) |
| Python | ![65.7%](https://img.shields.io/badge/coverage-65.7%25-yellow) | ![n/a](https://img.shields.io/badge/coverage-n%2Fa-lightgrey) |
| Ruby | ![90.9%](https://img.shields.io/badge/coverage-90.9%25-brightgreen) | ![n/a](https://img.shields.io/badge/coverage-n%2Fa-lightgrey) |
<!-- coverage:end -->

## Development

This is a multi-language monorepo. Build and test every port from the repo root:

```bash
make            # build + test all ports (same gates as CI)
make typescript # one port at a time: typescript / python / java / ruby
make coverage   # test with coverage in every port + regenerate coverage.json
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow and
[CLAUDE.md](CLAUDE.md) for the repository layout and architectural principles.

## License

[MIT](LICENSE)
