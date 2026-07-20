from datetime import datetime

from library_example import FEE_PER_DAY, add_money, gbp, late_fee, may_borrow
from varar import steps


def to_date(raw):
    return datetime.strptime(raw, "%B %d, %Y").date()


def format_date(d):
    return f"{d:%B} {d.day}, {d.year}"


def to_money(raw):
    return gbp(float(raw[:-1]) / 100) if raw.endswith("p") else gbp(float(raw[1:]))


def format_money(m):
    return f"{round(m.value * 100)}p" if m.value < 1 else f"£{m.value:.2f}"


param, stimulus, sensor = steps(lambda: {"loans": (), "fee": gbp(0), "granted": False})
param("date", r"[A-Z][a-z]+ \d{1,2}, \d{4}", parse=to_date, format=format_date)
param(
    "money",
    r"£(?=.*\d.*)[-+]?\d*(?:\.(?=\d.*))?\d*|\d+p",
    parse=to_money,
    format=format_money,
)
param("title", r"\*[^*]+\*", parse=lambda raw: raw[1:-1], format=lambda t: f"*{t}*")


@stimulus("borrowed {title}, due back on {date}")
def _(state, title, due):
    return {**state, "loans": (*state["loans"], {"title": title, "due": due})}


@stimulus("returns it on {date}")
def _(state, returned_on):
    fee = gbp(0)
    for loan in state["loans"]:
        fee = add_money(fee, late_fee(loan, returned_on))
    return {**state, "fee": fee}


@sensor("owes a {money} late fee")
def _(state, expected):
    return state["fee"]


@sensor("{money} for each day overdue")
def _(state, expected):
    return FEE_PER_DAY


@stimulus("asks to borrow {title} on {date}")
def _(state, title, on):
    return {**state, "granted": may_borrow(state["loans"], on)}


@sensor("the library refuses")
def _(state):
    if state["granted"]:
        raise AssertionError("expected the library to refuse")


@sensor("the library agrees")
def _(state):
    if not state["granted"]:
        raise AssertionError("expected the library to agree")
