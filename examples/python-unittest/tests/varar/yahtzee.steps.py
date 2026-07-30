from varar import steps
from yahtzee_example import score

param, stimulus, sensor = steps()


@sensor("Examples of dice, category and score")
def _(state, row):
    dice = [int(d.strip()) for d in row["dice"].split(",")]
    return {"score": score(dice, row["category"])}
