# frozen_string_literal: true

module Varar
  module Core
    # Run-result records — port of result.ts / result.rb's siblings in every
    # other port. The persisted .varar/<oath_path>.json file is a serialized
    # OathResults, read by the language server to place run diagnostics in the
    # editor (ADR 0014).

    # One mismatched CELL as a source-offset range plus the runtime value.
    # `from`/`to` are absolute UTF-16 source offsets; `to` is exclusive.
    CellFailure = Data.define(:from, :to, :actual)

    # Where a failure points in the source: an offset range, `to` exclusive.
    # The failing step's match span, or the first mismatched cell's span (the
    # failure_anchor rule) — what lets a renderer underline the step that
    # failed rather than the whole line it sits on.
    AnchorRange = Data.define(:from, :to)

    # The failure payload of a failed ExampleResult. `cells` and `anchor` are
    # nil when they do not apply, and serialize as absent (not null), so a
    # reader that predates them still parses the file. `stack` is deliberately
    # runtime-shaped — no consumer parses it.
    ExampleFailure = Data.define(:line, :message, :stack, :cells, :anchor) do
      def initialize(line:, message:, stack:, cells: nil, anchor: nil)
        super
      end
    end

    # The run result for one BDD example. `lines` are the 1-based source lines
    # of its steps (the editor's line-wash anchors).
    ExampleResult = Data.define(:name, :status, :lines, :failure) do
      def initialize(name:, status:, lines:, failure: nil)
        super
      end
    end

    # The persisted run result for one oath file. `oath_path` uses POSIX
    # separators and is relative to the workspace root; `source_hash` is
    # Hashing.hash_source over the oath as it was run, so a reader can tell
    # whether the offsets still apply to the buffer in front of it.
    OathResults = Data.define(:version, :oath_path, :source_hash, :examples)
  end
end
