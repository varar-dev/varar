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
    # `doc_path` is the document `line`, `cells` and `anchor` are offsets INTO.
    # nil — the overwhelming majority — means the oath itself; set only for a
    # step a reference block spliced in from another oath (ADR 0016).
    ExampleFailure = Data.define(:line, :message, :stack, :cells, :anchor, :doc_path) do
      def initialize(line:, message:, stack:, cells: nil, anchor: nil, doc_path: nil)
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
    # An oath other than this one that contributed steps to the run, with its
    # source hash as run (ADR 0016).
    ReferencedDocument = Data.define(:path, :source_hash)

    OathResults = Data.define(:version, :oath_path, :source_hash, :examples, :documents) do
      def initialize(version:, oath_path:, source_hash:, examples:, documents: [])
        super
      end
    end

    # Projection of OathResults onto the JSON shape of .varar/<oath_path>.json.
    #
    # The wire format is the TypeScript one (ADR 0014): camelCase names,
    # declaration order, and the optional members absent rather than null so a
    # reader that predates them still parses the file. Pure — writing the file
    # is the shell's job.
    module Results
      module_function

      def to_wire(results)
        out = {
          'version' => results.version,
          'oathPath' => results.oath_path,
          'sourceHash' => results.source_hash
        }
        unless results.documents.empty?
          out['documents'] = results.documents.map { |d| { 'path' => d.path, 'sourceHash' => d.source_hash } }
        end
        out['examples'] = results.examples.map { |e| example_to_wire(e) }
        out
      end

      def example_to_wire(example)
        out = { 'name' => example.name, 'status' => example.status, 'lines' => example.lines.to_a }
        out['failure'] = failure_to_wire(example.failure) if example.failure
        out
      end

      def failure_to_wire(failure)
        out = { 'line' => failure.line, 'message' => failure.message, 'stack' => failure.stack }
        if failure.cells && !failure.cells.empty?
          out['cells'] = failure.cells.map { |c| { 'from' => c.from, 'to' => c.to, 'actual' => c.actual } }
        end
        out['anchor'] = { 'from' => failure.anchor.from, 'to' => failure.anchor.to } if failure.anchor
        out['docPath'] = failure.doc_path if failure.doc_path
        out
      end
    end
  end
end
