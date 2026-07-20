# frozen_string_literal: true

require 'spec_helper'
require 'varar/core'

module Varar
  module Core
    # Translated from execute-state.test.ts / test_execute.py. Pins the stimulus
    # state contract, which conformance alone cannot distinguish: bundle
    # 02-context-isolation's stimulus returns the whole state, so a merging and a
    # replacing executor produce identical goldens.
    ::RSpec.describe Execute do
      # Runs the single example in `source` and returns [caught_error, seen_state].
      def run(source, register, create_context)
        registry = register.call(Registries.create_registry)
        var_doc = Parse.parse('example.md', source)
        execution = Plan.plan(var_doc, registry)
        caught = nil
        queued = Execute.collect_examples(execution, create_context: create_context)
        queued.each do |q|
          q.run.call
        rescue StandardError => e
          caught = e
        end
        caught
      end

      def stimulus(registry, expression, line, &handler)
        Registries.add_step(registry, expression: expression, expression_source_file: 'steps.rb',
                                      expression_source_line: line, kind: 'stimulus', handler: handler)
      end

      def sensor(registry, expression, line, &handler)
        Registries.add_step(registry, expression: expression, expression_source_file: 'steps.rb',
                                      expression_source_line: line, kind: 'sensor', handler: handler)
      end

      it 'a stimulus return fully replaces state — keys it omits are dropped, not merged' do
        seen = nil
        register = lambda do |r|
          r = stimulus(r, 'step one', 1) { |_state| { a: 1, b: 2 } }
          r = stimulus(r, 'step two', 2) { |_state| { b: 3 } }
          sensor(r, 'observe', 3) do |state|
            seen = state
            nil
          end
        end

        caught = run("# X\n\nstep one\nstep two\nobserve\n", register, ->(_file) { {} })

        expect(caught).to be_nil
        expect(seen).to eq({ b: 3 })
      end

      it 'a stimulus returning nothing leaves state unchanged' do
        seen = nil
        register = lambda do |r|
          r = stimulus(r, 'step one', 1) { |_state| { a: 1, b: 2 } }
          r = stimulus(r, 'step two', 2) { |_state| nil }
          sensor(r, 'observe', 3) do |state|
            seen = state
            nil
          end
        end

        caught = run("# X\n\nstep one\nstep two\nobserve\n", register, ->(_file) { {} })

        expect(caught).to be_nil
        expect(seen).to eq({ a: 1, b: 2 })
      end

      it 'a stimulus returning a non-Hash is a ReturnShapeError' do
        register = ->(r) { stimulus(r, 'step one', 1) { |_state| 42 } }

        caught = run("# X\n\nstep one\n", register, ->(_file) { {} })

        expect(caught).to be_a(ReturnShapeError)
        expect(caught.message).to include('complete next state')
      end
    end
  end
end
