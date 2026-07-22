from varar import steps

param, stimulus, sensor = steps(lambda: {})


# Two slots: the {string} capture and the trailing (non-header-bound) table,
# which arrives in the splat. Both are echoed back so the core actually
# compares them — the table's data rows only, since the header row is labels.
@sensor("I greet {string}")
def _(state, s, *extra):
    return [s, extra[0][1:]]
