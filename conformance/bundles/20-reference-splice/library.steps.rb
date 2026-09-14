require "varar"

steps(-> { { shelf: 0 } }) do
  stimulus("I shelve {int} books") { |state, n| { shelf: state[:shelf] + n } }

  stimulus("I borrow a book") { |state| { shelf: state[:shelf] - 1 } }

  sensor("The shelf holds {int} books") { |state, _n| state[:shelf] }
end
