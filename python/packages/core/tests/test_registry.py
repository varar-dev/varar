"""Tests for registry.py — translated from var-core/tests/registry.test.ts."""
from __future__ import annotations

import re

import pytest

from cucumber_expressions.parameter_type_registry import ParameterTypeRegistry

from varar_core.registry import add_step, create_registry, define_parameter_type


def test_create_registry_returns_empty_registry_with_default_parameter_types() -> None:
    r = create_registry()
    assert len(r.steps) == 0
    assert isinstance(r.parameter_types, ParameterTypeRegistry)


def test_add_step_returns_new_registry_original_unchanged() -> None:
    r0 = create_registry()
    handler = lambda: None  # noqa: E731
    r1 = add_step(
        r0,
        expression="I have {int} cukes",
        expression_source_file="steps.py",
        expression_source_line=1,
        handler=handler,
    )
    assert len(r0.steps) == 0
    assert len(r1.steps) == 1
    assert r1.steps[0].expression == "I have {int} cukes"


def test_define_parameter_type_makes_custom_type_available() -> None:
    r = create_registry()
    r = define_parameter_type(r, name="airport", regexp=re.compile(r"[A-Z]{3}"))
    # Compiling an expression that uses {airport} should succeed without UndefinedParameterTypeError
    r2 = add_step(
        r,
        expression="I fly to {airport}",
        expression_source_file="steps.py",
        expression_source_line=1,
        handler=lambda: None,
    )
    assert len(r2.steps) == 1


def test_define_parameter_type_parse_applied_at_runtime() -> None:
    r = create_registry()
    r = define_parameter_type(
        r,
        name="airport",
        regexp=re.compile(r"[A-Z]{3}"),
        parse=lambda raw: raw.lower(),
    )
    r = add_step(
        r,
        expression="I fly to {airport}",
        expression_source_file="steps.py",
        expression_source_line=1,
        handler=lambda: None,
    )
    match = r.steps[0].compiled.match("I fly to LHR")
    assert match is not None
    assert match[0].value == "lhr"


def test_add_step_raises_on_duplicate_expressions() -> None:
    r = create_registry()
    r = add_step(
        r,
        expression="I have {int} cukes",
        expression_source_file="a.py",
        expression_source_line=3,
        handler=lambda: None,
    )
    with pytest.raises(Exception, match=r"duplicate step definition.+a\.py:3.+b\.py:9"):
        add_step(
            r,
            expression="I have {int} cukes",
            expression_source_file="b.py",
            expression_source_line=9,
            handler=lambda: None,
        )


@pytest.mark.parametrize("sentence", ["I mention *Emma*", "I mention **Emma**"])
def test_builtin_emph_matches_and_strips_delimiters(sentence: str) -> None:
    r = create_registry()
    r = add_step(
        r,
        expression="I mention {emph}",
        expression_source_file="steps.py",
        expression_source_line=1,
        handler=lambda: None,
    )
    match = r.steps[0].compiled.match(sentence)
    assert match is not None
    # Only the outermost delimiter pair is stripped; the handler sees "Emma".
    assert match[0].value == "Emma"


def test_add_step_carries_kind() -> None:
    r = add_step(
        create_registry(),
        expression="I greet {string}",
        expression_source_file="a.steps.py",
        expression_source_line=1,
        handler=lambda: None,
        kind="sensor",
    )
    assert r.steps[0].kind == "sensor"


def test_kind_is_optional() -> None:
    r = add_step(
        create_registry(),
        expression="I greet {string}",
        expression_source_file="a.steps.py",
        expression_source_line=1,
        handler=lambda: None,
    )
    assert r.steps[0].kind is None
