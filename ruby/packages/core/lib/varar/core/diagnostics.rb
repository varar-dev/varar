# frozen_string_literal: true

module Varar
  module Core
    # A planning/run diagnostic on the shared rail. code is one of
    # "ambiguous-match", "error-fence-without-step", "drift". Port of
    # diagnostics.ts.
    Diagnostic = Data.define(:code, :severity, :message, :span)
    Candidate = Data.define(:expression, :source_file, :source_line)
    AmbiguousInput = Data.define(:text, :span, :candidates)

    module Diagnostics
      module_function

      def ambiguous_match(input)
        lines = input.candidates.map do |c|
          "  '#{c.expression}'    at #{c.source_file}:#{c.source_line}"
        end.join("\n")
        Diagnostic.new(
          severity: 'error',
          code: 'ambiguous-match',
          message: "Ambiguous step: \"#{input.text}\"\nMatched by:\n#{lines}",
          span: input.span
        )
      end

      def drift_detected(name, span)
        Diagnostic.new(
          severity: 'error',
          code: 'drift',
          message: "This paragraph was an example and no longer matches any step (drift): \"#{name}\".\n" \
                   'Fix the step so it matches again, or accept it as prose (run in update mode).',
          span: span
        )
      end

      def error_fence_without_step(span)
        Diagnostic.new(
          severity: 'error',
          code: 'error-fence-without-step',
          message: 'This `error` fence marks the example as expected-to-fail, ' \
                   'but the example has no step to run.',
          span: span
        )
      end

      # A reference block (ADR 0016) points at an oath the workspace does not
      # hold. Never prose: a link-only block that resolves to nothing has no
      # other reading, so it fails the run rather than degrading silently.
      def reference_not_found(text, path, span)
        Diagnostic.new(
          severity: 'error',
          code: 'reference-not-found',
          message: %(Reference to "#{text}" points at "#{path}", which is not an oath in this ) +
                   "workspace.\nCheck the path, and that the file is matched by the `docs` globs " \
                   'in varar.config.json.',
          span: span
        )
      end

      # The referenced document exists but the section contributes no steps — a
      # mistyped anchor, or a section that is pure prose.
      def reference_empty(text, path, slug, span)
        where = slug.empty? ? path : "#{path}##{slug}"
        Diagnostic.new(
          severity: 'error',
          code: 'reference-empty',
          message: %(Reference to "#{text}" resolves to "#{where}", which contributes no steps.\n) +
                   'Check the heading the anchor names, and that its section contains a matching ' \
                   'paragraph.',
          span: span
        )
      end

      # References may nest to any depth (depth is a style question, not a
      # rule), so a chain that reaches a section already on it must be reported
      # rather than recursed into.
      def reference_cycle(chain, span)
        Diagnostic.new(
          severity: 'error',
          code: 'reference-cycle',
          message: "Reference cycle: #{chain.join(' → ')}.",
          span: span
        )
      end
    end
  end
end
