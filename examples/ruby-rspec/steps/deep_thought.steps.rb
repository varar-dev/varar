require "oselvar/var"

param, stimulus, sensor = steps

sensor.("life, the universe and everything is {int}") { |_state, _answer| 42 }
