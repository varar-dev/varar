from var import define_state

stimulus, sensor = define_state(lambda: {})


@sensor("I greet {string}")
def _(state, s):
    return None
