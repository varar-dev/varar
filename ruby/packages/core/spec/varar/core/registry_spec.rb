# frozen_string_literal: true

require 'spec_helper'
require 'varar/core'

module Varar
  module Core
    # Pins the built-in {emph} parameter type: it is seeded into every registry
    # (no explicit param() needed), matches Markdown emphasis, and passes only
    # the stripped inner text to the handler.
    ::RSpec.describe Registries do
      # Compile `I mention {emph}` and return the transformed argument for the
      # first (only) parameter matched against +sentence+.
      def emph_value(sentence)
        registry = Registries.create_registry
        registry = Registries.add_step(
          registry, expression: 'I mention {emph}', expression_source_file: 'steps.rb',
                    expression_source_line: 1, kind: 'stimulus', handler: ->(_state, _v) {}
        )
        compiled = registry.steps.first.compiled
        args = compiled.match(sentence)
        raise "no match for #{sentence.inspect}" if args.nil?

        args.first.value(nil)
      end

      it 'matches single-asterisk emphasis and strips the delimiters' do
        expect(emph_value('I mention *Emma*')).to eq('Emma')
      end

      it 'matches double-asterisk emphasis and strips only the outer pair' do
        expect(emph_value('I mention **Emma**')).to eq('Emma')
      end

      it 'is seeded as a built-in without any custom param() call' do
        registry = described_class.create_registry
        registry = described_class.add_step(
          registry, expression: 'I mention {emph}', expression_source_file: 'steps.rb',
                    expression_source_line: 1, kind: 'stimulus', handler: ->(_state, _v) {}
        )
        expect(registry.steps.first.compiled).not_to be_nil
      end
    end
  end
end
