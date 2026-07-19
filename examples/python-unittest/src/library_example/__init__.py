from dataclasses import dataclass


@dataclass(frozen=True)
class Money:
    currency: str
    value: float


def gbp(value):
    return Money("GBP", value)


FEE_PER_DAY = gbp(0.5)


def add_money(a, b):
    if a.currency != b.currency:
        raise ValueError(f"cannot add {b.currency} to {a.currency}")
    return Money(a.currency, a.value + b.value)


def late_fee(loan, returned_on):
    days_late = max(0, (returned_on - loan["due"]).days)
    return gbp(days_late * FEE_PER_DAY.value)


def may_borrow(loans, on):
    return all(loan["due"] >= on for loan in loans)
