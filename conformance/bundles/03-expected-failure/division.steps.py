from var import define_state

stimulus, sensor = define_state(lambda: {})


@stimulus("I divide {int} by {int}")
def _(state, a, b):
    if b == 0:
        raise ZeroDivisionError("division by zero")
