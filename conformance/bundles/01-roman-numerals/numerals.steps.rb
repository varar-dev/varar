require "varar"

roman = { 1 => "I", 4 => "IV", 9 => "IX", 40 => "XL" }

steps do
  stimulus("I convert {int} to roman numerals") { |_state, n| { result: roman[n] } }

  # The trailing "." is matched literally, so {word} captures just the numeral
  # and the sensor can return the observed value for the core to compare.
  sensor("The result is {word}.") { |state, _expected| state[:result] }
end
