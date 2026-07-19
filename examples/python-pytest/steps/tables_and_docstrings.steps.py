from varar import steps

param, stimulus, sensor = steps()


@sensor("Uppercase each one:")
def _(state, rows):
    return [{"before": before, "after": before.upper()} for before, *_ in rows[1:]]


@sensor("Greet {word}:")
def _(state, name, doc):
    return [name, f"Hello, {name}!\n"]
