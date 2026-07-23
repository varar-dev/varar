# Varar + Ruby + RSpec

A standalone sample project that runs Markdown oaths as RSpec examples with
[Varar](https://varar.dev).

The `*.md` files in the `varar/` directory are the oaths — plain Markdown prose
that runs as tests. `spec/varar/*.steps.rb` bind the sentences to Ruby inside a
`steps(...) do … end` block with `stimulus`/`sensor` (and `param` for custom
types). `varar.config.json` says which files are oaths (`docs`) and where the
step definitions live (`steps`).

## Run

```sh
bundle install
bundle exec rspec
```

`spec/varar_spec.rb` calls `Varar::RSpec.generate`, which turns every
matched spec into one RSpec example group with one `it` per Markdown example
(header-bound table rows are separate examples). A paragraph that used to match
a step and no longer does fails as **drift**; re-run with `VARAR_UPDATE=1` to
accept it. The committed `varar.lock.json` is that drift baseline.
