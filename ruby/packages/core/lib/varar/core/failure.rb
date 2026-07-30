# frozen_string_literal: true

require 'varar/core/cell_diff'
require 'varar/core/failure_anchor'
require 'varar/core/result'

module Varar
  module Core
    # Converts a caught step error into the structured ExampleFailure payload —
    # port of failure.ts / failure.py / Failure.java / failure.rs. Shared by
    # every producer so failures are byte-identical across ports.
    #
    # Where TS scrapes an injected `<path>:line:col` stack frame for the failing
    # line, Ruby reads it off the anchor the executor attached (the Rust port
    # does the same): a Ruby backtrace has no synthetic frame to scrape, and the
    # anchor already carries the line the frame would have named.
    module Failures
      module_function

      # A caught step error → the ExampleResult.failure payload.
      #
      # `fallback_line` is used when the error carries no anchor, i.e. it never
      # passed through a step.
      def to_failure(error, _oath_path, fallback_line)
        anchor = FailureAnchor.attached_anchor(error)

        ExampleFailure.new(
          line: anchor ? anchor.start_line : fallback_line,
          message: error.message,
          stack: render_stack(error),
          cells: failing_cells(error),
          anchor: anchor && AnchorRange.new(from: anchor.start_offset, to: anchor.end_offset)
        )
      end

      # Every mismatched cell — table, header-bound row, inline capture or doc
      # string. nil (not an empty array) when the error is not a mismatch, so
      # the key stays absent in the serialized payload.
      def failing_cells(error)
        return nil unless error.is_a?(CellMismatchError)

        failing = error.cells.reject(&:ok).map do |c|
          CellFailure.new(from: c.span.start_offset, to: c.span.end_offset, actual: c.actual)
        end
        failing.empty? ? nil : failing
      end

      # Display-only: the message plus Ruby's own backtrace. Runtime-shaped by
      # design (ADR 0014) — no consumer parses it.
      def render_stack(error)
        ([error.message] + Array(error.backtrace)).join("\n")
      end
    end
  end
end
