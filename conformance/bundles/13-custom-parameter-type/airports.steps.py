from varar import steps

# Custom {airport} parameter type: IATA code, lowercased by the parse function.
# The lowercasing is asserted by the sensor (the .md says "lhr"), so an
# identity parse fails this bundle — proving parse functions execute.
param, stimulus, sensor = steps(lambda: {})
param("airport", "[A-Z]{3}", parse=lambda code: code.lower())


@stimulus("I fly to {airport}")
def _(state, dest):
    return {"dest": dest}


# The trailing "." is matched literally, so {word} captures just the code.
@sensor("The destination code is {word}.")
def _(state, expected):
    return state.get("dest")
