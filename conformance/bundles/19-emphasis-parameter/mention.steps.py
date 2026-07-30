from varar import steps

param, stimulus, sensor = steps(lambda: {})


@stimulus("I mention {emph}")
def _(state, m):
    pass
