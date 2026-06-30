from var import define_state

context, action, sensor = define_state(lambda: {})


@action("I divide {int} by {int}")
def _(state, a, b):
    if b == 0:
        raise ZeroDivisionError("division by zero")
