require "varar"

steps do
  # Two slots: the {string} capture and the trailing (non-header-bound) table,
  # which arrives in the splat. Both are echoed back so the core actually
  # compares them — the table's data rows only, since the header row is labels.
  sensor("I greet {string}") { |_state, s, *extra| [s, extra[0][1..]] }
end
