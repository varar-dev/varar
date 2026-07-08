# frozen_string_literal: true

require 'oselvar/var'

steps do
  sensor('life, the universe and everything is {int}') { 42 }
end
