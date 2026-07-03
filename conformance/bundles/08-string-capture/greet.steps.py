from var import define_state

stimulus, sensor = define_state(lambda: {})


@stimulus("I greet {string}")
def _(state, s):
    pass
