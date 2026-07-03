from var import define_state

stimulus, sensor = define_state(lambda: {})


@stimulus("I have {int} cukes")
def _(state, n):
    pass


@stimulus("I have 5 cukes")
def _(state):
    pass
