from varar import steps

# The example carries an `error` fence, so it asserts a failure. This stimulus
# raises nothing, so the fence inverts into an UnexpectedPassError — the kind no
# bundle exercised before this one.
param, stimulus, sensor = steps()


@stimulus("I do nothing at all")
def _(state):
    return None
