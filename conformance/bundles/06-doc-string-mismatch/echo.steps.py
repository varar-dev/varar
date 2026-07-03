from var import define_state

stimulus, sensor = define_state(lambda: {})


@sensor("I echo the following:")
def _(state, doc):
    return "goodbye"
