require "varar"

steps(-> { { count: 0 } }) do
  stimulus("I increment") { |state| { count: state[:count] + 1 } }

  # One slot ({int}): return the observed count and let the core compare it
  # against the number in the document.
  sensor("The count is {int}") { |state, _n| state[:count] }
end
