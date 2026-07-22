from varar import steps

param, stimulus, sensor = steps(lambda: {"count": 0})


@stimulus("I increment")
def _(state):
    return {"count": state["count"] + 1}


# One slot ({int}): return the observed count and let the core compare it
# against the number in the document.
@sensor("The count is {int}")
def _(state, n):
    return state["count"]
