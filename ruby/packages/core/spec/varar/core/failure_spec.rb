# frozen_string_literal: true

require 'spec_helper'
require 'varar/core'

module Varar
  module Core
    # Translated from failure.test.ts and failure-step-span.test.ts. The second
    # case is the point of the anchor: a sensor that raises shares its line with
    # a stimulus that passed, so a renderer underlining the line would blame the
    # stimulus too.
    ::RSpec.describe Failures do
      let(:source) { "# L\n\nHe asks on June 10, and the library agrees.\n" }
      let(:step_text) { 'the library agrees' }

      def run_failing_example
        registry = Registries.create_registry
        registry = Registries.add_step(registry, expression: 'asks on June 10',
                                                 expression_source_file: 'steps.rb',
                                                 expression_source_line: 1, kind: 'stimulus',
                                                 handler: ->(_state) {})
        registry = Registries.add_step(registry, expression: step_text,
                                                 expression_source_file: 'steps.rb',
                                                 expression_source_line: 2, kind: 'sensor',
                                                 handler: lambda { |_state|
                                                   raise 'expected the library to refuse'
                                                 })
        execution = Plan.plan(Parse.parse('l.md', source), registry)
        caught = nil
        Execute.collect_examples(execution, create_context: ->(_file) {}).each do |q|
          q.run.call
        rescue StandardError => e
          caught = e
        end
        caught
      end

      it 'records the anchor of the step that raised, not its whole line' do
        failure = described_class.to_failure(run_failing_example, 'l.md', 3)
        expect(failure.anchor).not_to be_nil
        expect(source[failure.anchor.from...failure.anchor.to]).to eq(step_text)
        expect(failure.message).to eq('expected the library to refuse')
      end

      it 'leaves the anchor nil for an error that never passed through a step' do
        failure = described_class.to_failure(StandardError.new('outside'), 'l.md', 7)
        expect(failure.anchor).to be_nil
        expect(failure.cells).to be_nil
        expect(failure.line).to eq(7)
      end

      it 'extracts only the failing cells of a mismatch' do
        source = 'a | 5 |'
        diff = CellDiff.new(column: 'n', span: Offsets.span_from_offsets(source, 4, 5),
                            expected: '5', actual: '4', ok: false)
        failure = described_class.to_failure(CellMismatchError.new([diff]), 'oath.md', 3)
        expect(failure.cells.map { |c| [c.from, c.to, c.actual] }).to eq([[4, 5, '4']])
      end
    end
  end
end
