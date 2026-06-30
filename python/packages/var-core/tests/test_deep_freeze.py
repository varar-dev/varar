"""test_deep_freeze.py — port of var-core/tests/deep-freeze.test.ts."""
from __future__ import annotations

import datetime
import types

import pytest

from var_core.deep_freeze import deep_freeze


def test_deep_freeze_freezes_nested_objects_and_arrays() -> None:
    """deepFreeze freezes nested objects and arrays."""
    o = deep_freeze({"a": {"b": 1}, "list": [{"c": 2}]})
    assert isinstance(o, types.MappingProxyType)
    assert isinstance(o["a"], types.MappingProxyType)
    assert isinstance(o["list"], tuple)
    assert isinstance(o["list"][0], types.MappingProxyType)


def test_deep_freeze_returns_primitives_and_none_unchanged() -> None:
    """deepFreeze returns primitives and None unchanged."""
    assert deep_freeze(5) == 5
    assert deep_freeze("x") == "x"
    assert deep_freeze(None) is None


def test_deep_freeze_returns_same_reference_idempotent_on_frozen_input() -> None:
    """deepFreeze returns the same reference (idempotent on frozen input)."""
    f = types.MappingProxyType({"a": 1})
    assert deep_freeze(f) is f


def test_deep_freeze_leaves_class_instances_live() -> None:
    """deepFreeze leaves class instances live (their methods still mutate)."""

    class Box:
        def __init__(self) -> None:
            self.items: list[int] = []

        def add(self, n: int) -> None:
            self.items.append(n)

    box = Box()
    state = deep_freeze({"box": box, "label": "x"})
    assert isinstance(state, types.MappingProxyType)  # enclosing plain dict IS frozen
    assert not isinstance(state["box"], types.MappingProxyType)  # class instance left live
    state["box"].add(1)  # should not raise
    assert state["box"].items == [1]


def test_deep_freeze_leaves_date_instances_live() -> None:
    """deepFreeze leaves datetime instances live."""
    when = datetime.datetime(2026, 6, 12, tzinfo=datetime.timezone.utc)
    state = deep_freeze({"when": when})
    assert isinstance(state, types.MappingProxyType)
    assert not isinstance(state["when"], types.MappingProxyType)
    # datetime is still a fully functional object
    assert state["when"].year == 2026


def test_deep_freeze_mutation_raises_type_error() -> None:
    """Mutating a deep-frozen dict raises TypeError."""
    state = deep_freeze({"a": 1})
    with pytest.raises(TypeError):
        state["a"] = 2  # type: ignore[index]


def test_deep_freeze_nested_mutation_raises_type_error() -> None:
    """Mutating a nested deep-frozen dict raises TypeError."""
    state = deep_freeze({"nested": {"b": 2}})
    with pytest.raises(TypeError):
        state["nested"]["b"] = 99  # type: ignore[index]
