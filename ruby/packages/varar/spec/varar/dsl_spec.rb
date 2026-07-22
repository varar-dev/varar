# frozen_string_literal: true

require 'spec_helper'
require 'varar'
require 'varar/registry'

# The state factory must produce a fresh value per example. Ruby is the port
# where this was least obvious: `steps(count: 0)` used to close over one Hash
# shared by every example. Varar hands the state to handlers untouched, so the
# factory is the only thing standing between one example and the next one's
# mutations — exactly the shape of
# `examples/ruby-rspec/steps/library.steps.rb`, whose state held a Money.
module Varar
  ::RSpec.describe 'steps state factory' do
    before { RegistryGlue.reset_builder }

    it 'calls the factory afresh for each example, yielding a distinct object' do
      steps(-> { { count: 0 } }) { nil }
      factory = RegistryGlue.context_factory

      first = factory.call(__FILE__)
      second = factory.call(__FILE__)

      expect(first).to eq(second)
      expect(first).not_to equal(second), 'expected a fresh instance per call, not one shared Hash'
    end

    it 'gives each example its own copy of a nested custom object' do
      holder = Struct.new(:value)
      steps(-> { { money: holder.new(0) } }) { nil }
      factory = RegistryGlue.context_factory

      first = factory.call(__FILE__)
      second = factory.call(__FILE__)

      expect(first[:money]).not_to equal(second[:money]),
                                   'a nested object must not be shared between examples'
    end

    it 'rejects a Hash, which would be shared across every example' do
      expect { steps({ count: 0 }) { nil } }
        .to raise_error(ArgumentError, %r{Proc/lambda state factory})
    end

    it 'allows the factory to be omitted for stateless step files' do
      expect { steps { nil } }.not_to raise_error
    end
  end
end
