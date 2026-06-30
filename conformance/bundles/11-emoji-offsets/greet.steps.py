from var import define_state

context, action, sensor = define_state(lambda: {})


@sensor("I greet {string}")
def _(state, s, *extra):
    return None
