from var import define_state

context, action, sensor = define_state(lambda: {})


@action("I have {int} cukes")
def _(state, n):
    pass
