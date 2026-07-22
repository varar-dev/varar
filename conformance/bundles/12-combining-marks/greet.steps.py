from varar import steps

param, stimulus, sensor = steps(lambda: {})


# One slot: echoing the capture back makes the core compare it against the
# document, which is what exercises the combining-mark span offsets.
@sensor("I greet {string}")
def _(state, s):
    return s
