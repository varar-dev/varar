from varar import steps

param, stimulus, sensor = steps(lambda: {"shelf": 0})


@stimulus("I shelve {int} books")
def _(state, n):
    return {"shelf": state["shelf"] + n}


@stimulus("I borrow a book")
def _(state):
    return {"shelf": state["shelf"] - 1}


@sensor("The shelf holds {int} books")
def _(state, n):
    return state["shelf"]
