# frozen_string_literal: true

require 'varar/internal'

# `steps` as a top-level method, available in any step file after
# `require "varar"` (idiomatic for BDD step DSLs, like Cucumber-Ruby's
# Given/When/Then). It takes a block in which bare `stimulus`, `sensor` and
# `param` register the file's steps:
#
#   steps(-> { { greeting: '' } }) do
#     stimulus('I greet {string}') { |state, name| state.merge(greeting: "Hello, #{name}!") }
#     sensor('the greeting is {string}') { |state, _expected| state[:greeting] }
#   end
#
# The initial state is optional — omit it entirely for stateless step files —
# but when given it MUST be a Proc/lambda, called fresh for every example. A
# Hash was previously accepted and closed over a single object shared by every
# example in the file; nested values `deep_freeze` does not recurse into (it
# only descends Hash and Array) were then mutable and shared. Requiring a
# factory makes freshness structural rather than something the deep-freeze has
# to defend. The state is keyed by the calling file so contexts never bleed
# across step files.
module Kernel
  private

  def steps(factory = nil, &block)
    unless factory.nil? || factory.is_a?(Proc)
      raise ArgumentError,
            'steps expects a Proc/lambda state factory, called fresh per example — ' \
            "got #{factory.class}. Wrap it: steps(-> { { count: 0 } })"
    end

    builder = Varar::Internal.register(factory || -> { {} }, caller_locations(1, 1).first.path)
    builder.instance_eval(&block) if block
    nil
  end
end
