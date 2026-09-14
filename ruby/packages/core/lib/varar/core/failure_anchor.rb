# frozen_string_literal: true

require 'varar/core/cell_diff'
require 'varar/core/doc_string_diff'

module Varar
  module Core
    # Where a failure points in the .md source: a mismatch anchors at its first
    # failing span (cell / doc-string body), anything else at the fallback (the
    # step's match span). The single source of truth for failure locations,
    # pinned as failure.anchor in the conformance trace. Port of failure-anchor.ts.
    module FailureAnchor
      module_function

      # The anchor travels with the raised error, from the executor (which knows
      # the step) to Failures.to_failure (which only sees the error) — the same
      # job TS does with a global symbol on the Error. An instance variable on
      # the exception, so it never shows up in `inspect` output the way an
      # extra attribute would.
      ANCHOR_IVAR = :@varar_failure_anchor
      DOC_PATH_IVAR = :@varar_failure_doc_path

      def failure_anchor(error, fallback)
        case error
        when CellMismatchError
          failing = error.cells.find { |c| !c.ok }
          failing ? failing.span : fallback
        else
          fallback
        end
      end

      # Record on the error itself where the failure points.
      def attach_anchor(error, anchor)
        error.instance_variable_set(ANCHOR_IVAR, anchor) if error.respond_to?(:instance_variable_set)
      end

      # The anchor the executor attached, or nil if there is none — then a
      # renderer only has the failing line to go on.
      def attached_anchor(error)
        return nil unless error.respond_to?(:instance_variable_get)

        error.instance_variable_get(ANCHOR_IVAR)
      end

      # The document the anchor's offsets belong to, for a step a reference
      # block spliced in from another oath (ADR 0016). Travels the same way and
      # for the same reason as the anchor: the executor knows the step, and
      # whoever builds the failure payload sees only the error.
      def attach_doc_path(error, doc_path)
        return unless error.respond_to?(:instance_variable_set)

        error.instance_variable_set(DOC_PATH_IVAR, doc_path)
      end

      def attached_doc_path(error)
        return nil unless error.respond_to?(:instance_variable_get)

        error.instance_variable_get(DOC_PATH_IVAR)
      end
    end
  end
end
