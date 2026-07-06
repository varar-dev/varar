from var import define_state

# Custom {airport} parameter type: IATA code, lowercased by the parse function.
# The lowercasing is asserted by the sensor (the .md says "lhr"), so an
# identity parse fails this bundle — proving parse functions execute.
stimulus, sensor = define_state(
    lambda: {},
    param_types={
        "airport": {"regexp": "[A-Z]{3}", "parse": lambda code: code.lower()}
    },
)


@stimulus("I fly to {airport}")
def _(state, dest):
    return {"dest": dest}


@sensor("The destination code is {word}")
def _(state, expected):
    # {word} greedily captures the sentence-ending period (same cleanup as
    # bundle 01) — strip it before comparing.
    cleaned = expected.rstrip(".!?")
    if state.get("dest") != cleaned:
        raise AssertionError(f"expected {cleaned} but got {state.get('dest')}")
