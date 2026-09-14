# frozen_string_literal: true

require 'varar/core/span'
require 'varar/core/ast'
require 'varar/core/cell_diff'
require 'varar/core/diagnostics'
require 'varar/core/matcher'
require 'varar/core/reference'
require 'varar/core/sentences'

module Varar
  module Core
    DocString = Data.define(:content, :content_type, :span)

    # param_texts: the notation each parameter matched, sliced at plan time from
    # the document the step was WRITTEN in — consumers must use it rather than
    # slicing the running oath's source, because a step a reference block
    # spliced in (ADR 0016) has spans in a different document.
    # doc_path: set only on such a spliced step — the document its spans belong to.
    PlannedStep = Data.define(:text, :match_span, :param_spans, :param_texts, :step_def, :args, :formats,
                              :data_table, :doc_string, :doc_path) do
      def initialize(text:, match_span:, param_spans:, step_def:, args:, param_texts: [], formats: [],
                     data_table: nil, doc_string: nil, doc_path: nil)
        super
      end
    end

    HeaderBinding = Data.define(:match_span, :param_spans, :step_def)

    PlannedExample = Data.define(:name, :scope_stack, :span, :steps, :header_binding, :row_checks,
                                 :expected_outcome, :expected_error_message) do
      def initialize(name:, scope_stack:, span:, steps:, header_binding: nil, row_checks: nil,
                     expected_outcome: nil, expected_error_message: nil)
        super
      end
    end

    ExecutionPlan = Data.define(:doc, :examples, :diagnostics)

    # Produce an ExecutionPlan from a Doc + Registry: match step expressions
    # against every text block, attach trailing tables/fences, detect
    # header-bound tables, and collect diagnostics. Port of plan.ts.
    module Plan
      BlockPlan = Data.define(:steps, :ambiguities)
      Ambiguity = Data.define(:match_start, :match_end, :candidates)

      # A candidate paragraph, planned in isolation (Phase 1). Either a
      # header-bound table (standalone rows) or a step-bearing candidate the
      # grouping pass may merge into an open example.
      HeaderBoundUnit = Data.define(:rows)
      # A reference block: its whole text is a link to an oath section, whose
      # steps are spliced in here (ADR 0016). Never prose, so it does not close
      # the open example. Its span and scope stack are the referring
      # document's: the example it opens lives here, not in the section.
      ReferenceUnit = Data.define(:reference, :preceded_by_delimiter, :span, :scope_stack)
      StepsUnit = Data.define(:matched, :preceded_by_delimiter, :name, :scope_stack, :span, :steps,
                              :expected_outcome, :expected_error_message)

      # An open, merging example being built up across adjacent matching
      # candidates in Phase 2.
      # name_from_reference: true while the name came from a spliced
      # (referenced) paragraph and is waiting to be replaced by the example's
      # own first matching paragraph.
      MergedExample = Struct.new(:name, :scope_stack, :start_offset, :end_offset, :steps,
                                 :expected_outcome, :expected_error_message, :name_from_reference)

      module_function

      def plan(doc, registry, workspace)
        diagnostics = []

        # A section another oath references stops being a standalone example:
        # it runs where it is referenced, not here (ADR 0016).
        whole_file = Reference.section_key(doc.path, '')
        consumed = lambda do |ex|
          workspace.referenced.include?(whole_file) ||
            ex.scope_stack.any? do |h|
              workspace.referenced.include?(Reference.section_key(doc.path, Reference.slugify(h)))
            end
        end

        # Phase 1: plan each candidate paragraph independently into a "unit".
        units = doc.examples.reject { |ex| consumed.call(ex) }
                   .map { |ex| plan_candidate(ex, doc, registry, diagnostics) }

        # Phase 2: group adjacent candidates into examples. A matching candidate
        # continues the open example when no delimiter (heading / `---`) precedes
        # it; otherwise it starts a new one. A non-matching candidate (prose) is
        # a delimiter: it closes the open example and is dropped. A header-bound
        # table candidate is standalone — one example per row. See ADR 0012.
        examples = []
        open = nil
        flush = lambda do
          examples << finish_merged(open, doc.source) if open
          open = nil
        end
        units.each do |unit|
          if unit.is_a?(HeaderBoundUnit)
            flush.call
            examples.concat(unit.rows)
            next
          end
          if unit.is_a?(ReferenceUnit)
            # Splice the referenced section's steps in at this position. Only
            # the reference block itself is subject to the delimiter rule;
            # everything it splices in belongs to the same sequence, so a
            # section of several paragraphs stays one example.
            resolve_reference(unit, doc, registry, workspace, diagnostics, []).each_with_index do |spliced, i|
              if open && (i.positive? || !unit.preceded_by_delimiter)
                merge_into(open, spliced, from_reference: true)
              else
                flush.call
                open = start_merged(spliced)
                # An example that OPENS with a reference is named by its own
                # first matching paragraph, not by the section it pulls in, and
                # it sits under THIS document's headings, not the section's.
                open.name_from_reference = true
                open.scope_stack = unit.scope_stack
                open.start_offset = unit.span.start_offset
              end
              # A spliced unit's span is in the referenced document; the
              # example's span is in this one. It ends at the reference block
              # until a later paragraph of the example's own extends it.
              open.end_offset = unit.span.end_offset
            end
            next
          end
          unless unit.matched
            # Prose paragraph — a delimiter. Drop it and end the open example.
            flush.call
            next
          end
          if open && !unit.preceded_by_delimiter
            merge_into(open, unit)
          else
            flush.call
            open = start_merged(unit)
          end
        end
        flush.call

        ExecutionPlan.new(doc: doc, examples: examples, diagnostics: diagnostics)
      end

      # Resolve one reference block into the step-bearing units of the section
      # it names, recursively: a referenced section may itself contain
      # reference blocks, to any depth (ADR 0016 leaves depth to the author's
      # judgement). `chain` carries the sections currently being resolved so a
      # repeat is reported as a cycle instead of recursing forever.
      def resolve_reference(unit, from_doc, registry, workspace, diagnostics, chain)
        ref = unit.reference
        key = Reference.section_key(ref.path, ref.slug)
        if chain.include?(key)
          diagnostics << Diagnostics.reference_cycle(chain + [key], unit.span)
          return []
        end
        # A same-file reference resolves against the document being planned,
        # which is not necessarily in the workspace.
        target = ref.path == from_doc.path ? from_doc : workspace.docs[ref.path]
        if target.nil?
          diagnostics << Diagnostics.reference_not_found(ref.text, ref.path, unit.span)
          return []
        end
        out = []
        Reference.section_candidates(target, ref.slug).each do |candidate|
          planned = plan_candidate(candidate, target, registry, diagnostics)
          if planned.is_a?(ReferenceUnit)
            out.concat(resolve_reference(planned, target, registry, workspace, diagnostics, chain + [key]))
            next
          end
          # A header-bound table produces one example per row, which a spliced
          # step list cannot express; an `error` fence declares an outcome for
          # an example, not for a reusable fragment. Both are left out.
          next unless planned.is_a?(StepsUnit) && planned.matched

          out << tag_with_doc(planned, target.path, from_doc.path)
        end
        diagnostics << Diagnostics.reference_empty(ref.text, ref.path, ref.slug, unit.span) if out.empty?
        out
      end

      # Carry the source document's identity on every spliced step, so a failure
      # in a referenced section reports spans against the file they were written
      # in rather than the file being run.
      def tag_with_doc(unit, doc_path, host_path)
        return unit if doc_path == host_path

        unit.with(steps: unit.steps.map { |step| step.with(doc_path: doc_path) })
      end

      def start_merged(unit)
        MergedExample.new(unit.name, unit.scope_stack, unit.span.start_offset, unit.span.end_offset,
                          unit.steps.dup, unit.expected_outcome, unit.expected_error_message, false)
      end

      def merge_into(open, unit, from_reference: false)
        if open.name_from_reference && !from_reference
          open.name = unit.name
          open.scope_stack = unit.scope_stack
          open.name_from_reference = false
        end
        open.end_offset = unit.span.end_offset
        open.steps.concat(unit.steps)
        # Any error fence in a merged part marks the whole example
        # expected-to-fail; keep the first message we see.
        return unless unit.expected_outcome == 'fail'

        open.expected_outcome = 'fail'
        return unless open.expected_error_message.nil? && !unit.expected_error_message.nil?

        open.expected_error_message = unit.expected_error_message
      end

      def finish_merged(open, source)
        span = Offsets.span_from_offsets(source, open.start_offset, open.end_offset)
        PlannedExample.new(
          name: open.name,
          scope_stack: open.scope_stack,
          span: span,
          steps: open.steps,
          expected_outcome: open.expected_outcome,
          expected_error_message: open.expected_error_message
        )
      end

      # Plan a single candidate paragraph (plus attached tables/fences) in
      # isolation. Emits ambiguity / error-fence diagnostics into +diagnostics+.
      def plan_candidate(ex, doc, registry, diagnostics)
        # A block whose whole text is a link to an oath section is a reference,
        # not content: never matched against step definitions, never prose.
        primary = ex.body.first
        if primary.respond_to?(:text)
          ref = Reference.reference_of(primary.text, doc.path)
          if ref
            return ReferenceUnit.new(reference: ref, preceded_by_delimiter: ex.preceded_by_delimiter,
                                     span: ex.span, scope_stack: ex.scope_stack)
          end
        end

        had_ambiguous = false
        steps_by_block = {}

        # Pass 1: plan each text-bearing block.
        ex.body.each_with_index do |block, idx|
          next unless %w[paragraph list_item blockquote].include?(block.kind)

          result = plan_block(block.text, registry)

          result.ambiguities.each do |collision|
            span = lift_span(doc.source, block, collision.match_start, collision.match_end)
            cp_start = Offsets.cp_index_for_utf16(block.text, collision.match_start)
            cp_end = Offsets.cp_index_for_utf16(block.text, collision.match_end)
            diagnostics << Diagnostics.ambiguous_match(
              AmbiguousInput.new(
                text: block.text[cp_start...cp_end],
                span: span,
                candidates: collision.candidates.map do |c|
                  Candidate.new(
                    expression: c.expression,
                    source_file: c.step_def.expression_source_file,
                    source_line: c.step_def.expression_source_line
                  )
                end
              )
            )
            had_ambiguous = true
          end

          next unless !had_ambiguous && !result.steps.empty?

          steps_by_block[idx] = result.steps.map do |hit|
            PlannedStep.new(
              text: Offsets.utf16_slice(block.text, hit.match_start, hit.match_end),
              match_span: lift_span(doc.source, block, hit.match_start, hit.match_end),
              param_spans: hit.param_spans.map { |p| lift_span(doc.source, block, p.start, p.end) },
              param_texts: hit.param_spans.map { |p| Offsets.utf16_slice(block.text, p.start, p.end) },
              step_def: hit.step_def,
              args: hit.args,
              formats: hit.formats
            )
          end
        end

        # Header-bound table detection.
        bound = had_ambiguous ? nil : detect_header_bound(ex, steps_by_block, doc.source)
        if bound
          table, binding_step, header_spans = bound
          header_binding = HeaderBinding.new(
            match_span: binding_step.match_span,
            param_spans: header_spans,
            step_def: binding_step.step_def
          )
          rows = table.rows.map do |row|
            row_object = {}
            table.header.cells.each_with_index do |cell_name, i|
              row_object[cell_name] = i < row.cells.length ? row.cells[i] : ''
            end
            row_step = binding_step.with(match_span: row.span, args: binding_step.args + [row_object])
            row_checks = table.header.cells.each_with_index.map do |cell_name, i|
              RowCheck.new(
                column: cell_name,
                value: i < row.cells.length ? row.cells[i] : '',
                span: i < row.cell_spans.length ? row.cell_spans[i] : row.span
              )
            end
            PlannedExample.new(
              name: row.cells.join(' / '),
              scope_stack: ex.scope_stack + [binding_step.text],
              span: row.span,
              steps: [row_step],
              header_binding: header_binding,
              row_checks: row_checks
            )
          end
          return HeaderBoundUnit.new(rows: rows)
        end

        # Error fence detection.
        error_fence = ex.body.find { |b| b.kind == 'fence' && b.info == 'error' }

        # Pass 2: attach trailing table / fence to the last step of a block.
        attachments = {}
        (1...ex.body.length).each do |idx|
          here = ex.body[idx]
          if here.kind == 'table' && steps_by_block.key?(idx - 1)
            _prev_data, prev_doc = attachments[idx - 1] || [nil, nil]
            attachments[idx - 1] = [here, prev_doc]
          elsif here.kind == 'fence' && here.info != 'error' && steps_by_block.key?(idx - 1)
            prev_data, = attachments[idx - 1] || [nil, nil]
            attachments[idx - 1] = [
              prev_data,
              DocString.new(content: here.body, content_type: here.info, span: here.body_span)
            ]
          end
        end

        # Pass 3: rebuild the final step list, applying attachments.
        final_steps = []
        (0...ex.body.length).each do |idx|
          block_steps = steps_by_block[idx] || []
          attach = attachments[idx]
          block_steps.each_with_index do |step, s_idx|
            if s_idx == block_steps.length - 1 && attach
              data_table, doc_string = attach
              final_steps << step.with(data_table: data_table, doc_string: doc_string)
            else
              final_steps << step
            end
          end
        end

        runnable_steps = had_ambiguous ? [] : final_steps

        diagnostics << Diagnostics.error_fence_without_step(error_fence.span) if error_fence && runnable_steps.empty?

        expected_outcome = nil
        expected_error_message = nil
        if error_fence
          expected_outcome = 'fail'
          msg = error_fence.body.strip
          expected_error_message = msg unless msg.empty?
        end

        StepsUnit.new(
          matched: !runnable_steps.empty?,
          preceded_by_delimiter: ex.preceded_by_delimiter,
          name: derive_example_name(ex.body),
          scope_stack: ex.scope_stack,
          span: ex.span,
          steps: runnable_steps,
          expected_outcome: expected_outcome,
          expected_error_message: expected_error_message
        )
      end

      def plan_block(text, registry)
        all_steps = []
        all_ambiguities = []

        Sentences.split_sentences(text).each do |sentence|
          hits = Matcher.find_hits(sentence.text, registry)
          adjusted = hits.map do |h|
            Hit.new(
              expression: h.expression,
              step_def: h.step_def,
              match_start: h.match_start + sentence.start_offset,
              match_end: h.match_end + sentence.start_offset,
              args: h.args,
              param_spans: h.param_spans.map do |p|
                ParamSpan.new(start: p.start + sentence.start_offset, end: p.end + sentence.start_offset)
              end,
              formats: h.formats
            )
          end
          resolved = Matcher.resolve_hits(adjusted)
          if resolved.kind == 'ambiguous'
            resolved.collisions.each do |c|
              all_ambiguities << Ambiguity.new(match_start: c.match_start, match_end: c.match_end,
                                               candidates: c.candidates)
            end
          elsif !resolved.steps.empty?
            all_steps.concat(resolved.steps)
          end
        end

        BlockPlan.new(steps: all_steps, ambiguities: all_ambiguities)
      end

      # Whole-word, case-sensitive start index of +word+ in +haystack+, or nil.
      def word_offset(haystack, word)
        m = /(?<![^\W_])#{Regexp.escape(word)}(?![^\W_])/.match(haystack)
        m&.begin(0)
      end

      def detect_header_bound(ex, steps_by_block, source)
        body = ex.body
        (1...body.length).each do |idx|
          here = body[idx]
          next unless here.kind == 'table'

          above = body[idx - 1]
          next unless %w[paragraph list_item blockquote].include?(above.kind)

          steps = steps_by_block[idx - 1]
          next if steps.nil? || steps.empty?

          header_cells = here.header.cells
          offsets = header_cells.map { |cell| word_offset(above.text, cell) }
          next if offsets.any?(&:nil?)

          utf16_offsets = offsets.map { |o| Offsets.to_utf16_offset(above.text, o) }
          header_spans = header_cells.each_index.map do |i|
            lift_span(source, above, utf16_offsets[i], utf16_offsets[i] + Offsets.utf16_len(header_cells[i]))
          end
          return [here, steps.last, header_spans]
        end
        nil
      end

      def derive_example_name(body)
        primary = body.find { |b| %w[paragraph list_item blockquote].include?(b.kind) }
        return '' if primary.nil?

        name = primary.text.gsub(/\s+/, ' ').strip
        name.sub(/[.!?]$/, '')
      end

      def lift_segment_offset(segment_map, text_offset)
        best = segment_map.first
        segment_map.each { |entry| best = entry if entry.text_offset <= text_offset }
        raise 'empty segment_map' if best.nil?

        best.source_offset + (text_offset - best.text_offset)
      end

      def lift_span(source, block, block_start, block_end)
        return block.span unless %w[paragraph list_item blockquote].include?(block.kind)

        start_src = lift_segment_offset(block.segment_map, block_start)
        end_src = lift_segment_offset(block.segment_map, block_end)
        Offsets.span_from_offsets(source, start_src, end_src)
      end
    end
  end
end
