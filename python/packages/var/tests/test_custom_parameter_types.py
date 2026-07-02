import re

import pytest

from var import define_state
from var.registry import _custom_parameter_types, _reset_builder


def test_projects_name_and_pattern_source():
    _reset_builder()
    define_state(
        lambda: {},
        param_types={
            "airport": {"regexp": re.compile(r"[A-Z]{3}"), "transformer": lambda code: code.lower()}
        },
    )
    assert _custom_parameter_types() == [{"name": "airport", "regexp": "[A-Z]{3}"}]
    _reset_builder()
    assert _custom_parameter_types() == []


def test_string_regexp_passes_through_verbatim():
    _reset_builder()
    define_state(lambda: {}, param_types={"airport": {"regexp": "[A-Z]{3}"}})
    assert _custom_parameter_types() == [{"name": "airport", "regexp": "[A-Z]{3}"}]
    _reset_builder()


def test_list_form_regexp_is_rejected():
    _reset_builder()
    define_state(lambda: {}, param_types={"code": {"regexp": ["[A-Z]{3}", "[0-9]{3}"]}})
    with pytest.raises(TypeError, match="not supported"):
        _custom_parameter_types()
    _reset_builder()
