# frozen_string_literal: true

require 'oselvar/var'

_, _, sensor = steps

sensor.call('life, the universe and everything is {int}') { |_state, _answer| 42 }
