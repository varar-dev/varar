# frozen_string_literal: true

require 'varar'

steps do
  sensor('Uppercase each one:') do |_state, rows|
    rows[1..].map { |before, *| { 'before' => before, 'after' => before.upcase } }
  end

  sensor('Greet {word}:') do |_state, name, _doc|
    [name, "Hello, #{name}!\n"]
  end
end
