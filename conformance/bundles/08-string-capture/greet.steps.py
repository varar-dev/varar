from var import define_state

context, action, sensor = define_state(lambda: {})


@action("I greet {string}")
def _(state, s):
    pass
