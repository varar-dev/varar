from var import define_state

context, action, sensor = define_state(lambda: {"count": 0})


@action("I increment")
def _(state):
    state["count"] = state["count"] + 1


@sensor("The count is {int}")
def _(state, n):
    if state["count"] != n:
        raise AssertionError(f"expected {n} but got {state['count']}")
