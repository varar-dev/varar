# frozen_string_literal: true

require 'varar'

steps(-> { { greeting: '', result: 0 } }) do
  stimulus('I greet {string}') { |state, name| state.merge(greeting: "Hello, #{name}!") }
  sensor('the greeting should be {string}') { |state, _expected| state[:greeting] }

  stimulus('expression `{int}+{int}`') { |state, a, b| state.merge(result: a + b) }
  sensor('evaluate to `{int}`') { |state, _expected| state[:result] }
end
