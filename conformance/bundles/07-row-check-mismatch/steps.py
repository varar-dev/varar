from var import define_state

context, action, sensor = define_state(lambda: {})


@sensor("I report the score and grade")
def _(state):
    return {"score": "99", "grade": "A"}
