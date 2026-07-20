require "varar"

# The second stimulus returns only :b. Under the full-replacement contract :a is
# therefore gone, and the sensor reads it back as 0. A merging executor would
# carry a: 1 over and read back 1 — which is exactly what this bundle pins.
steps(-> { { a: 0, b: 0 } }) do
  stimulus("I set a to 1 and b to 2") { |_state| { a: 1, b: 2 } }

  stimulus("I set only b to 3") { |_state| { b: 3 } }

  sensor("Then a is {int} and b is {int}") do |state, _a, _b|
    [state[:a] || 0, state[:b] || 0]
  end
end
