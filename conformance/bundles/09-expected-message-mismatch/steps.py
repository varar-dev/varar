from var import define_state

context, action, sensor = define_state(lambda: {})


@action("I always boom")
def _(state):
    raise RuntimeError("actual different error")
