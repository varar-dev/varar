from var import define_state

stimulus, sensor = define_state(lambda: {})


@stimulus("I always boom")
def _(state):
    raise RuntimeError("actual different error")
