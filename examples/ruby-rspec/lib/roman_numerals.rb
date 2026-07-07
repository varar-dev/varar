# frozen_string_literal: true

module RomanNumerals
  NUMERALS = [
    ["M", 1000], ["CM", 900], ["D", 500], ["CD", 400], ["C", 100], ["XC", 90],
    ["L", 50], ["XL", 40], ["X", 10], ["IX", 9], ["V", 5], ["IV", 4], ["I", 1]
  ].freeze

  module_function

  def to_roman(num)
    result = +""
    NUMERALS.each do |letter, value|
      while num >= value
        num -= value
        result << letter
      end
    end
    result
  end
end
