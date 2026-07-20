require "varar"

# The example carries an `error` fence, so it asserts a failure. This stimulus
# raises nothing, so the fence inverts into an UnexpectedPassError — the kind no
# bundle exercised before this one.
steps do
  stimulus("I do nothing at all") { |_state| nil }
end
