# frozen_string_literal: true

require 'oselvar/var'

_, stimulus, sensor = steps { { greeting: '', result: 0 } }

stimulus.call('I greet {string}') { |_state, name| { greeting: "Hello, #{name}!" } }

sensor.call('the greeting should be {string}') { |state, _expected| state[:greeting] }

stimulus.call('expression `{int}+{int}`') { |_state, a, b| { result: a + b } }

sensor.call('evaluate to `{int}`') { |state, _expected| state[:result] }
