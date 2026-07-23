# frozen_string_literal: true

require 'varar'
require_relative '../lib/roman_numerals'

steps do
  sensor('a decimal and a roman number') do |_state, row|
    { 'decimal' => row['decimal'], 'roman' => RomanNumerals.to_roman(row['decimal'].to_i) }
  end
end
