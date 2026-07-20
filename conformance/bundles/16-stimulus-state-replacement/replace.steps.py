from varar import steps

# The second stimulus returns only "b". Under the full-replacement contract "a"
# is therefore gone, and the sensor reads it back as 0. A merging executor would
# carry "a": 1 over and read back 1 — which is exactly what this bundle pins.
param, stimulus, sensor = steps(lambda: {"a": 0, "b": 0})


@stimulus("I set a to 1 and b to 2")
def _(state):
    return {"a": 1, "b": 2}


@stimulus("I set only b to 3")
def _(state):
    return {"b": 3}


@sensor("Then a is {int} and b is {int}")
def _(state, a, b):
    return [state.get("a", 0), state.get("b", 0)]
