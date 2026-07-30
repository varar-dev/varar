from varar import steps

param, stimulus, sensor = steps(lambda: {})

ROMAN = {1: "I", 4: "IV", 9: "IX", 40: "XL"}


@stimulus("I convert {int} to roman numerals")
def _(state, n):
    return {"result": ROMAN.get(n)}


# The trailing "." is matched literally, so {word} captures just the numeral and
# the sensor can return the observed value for the core to compare.
@sensor("The result is {word}.")
def _(state, expected):
    return state.get("result")
