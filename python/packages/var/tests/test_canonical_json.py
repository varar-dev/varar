from var.canonical_json import canonical_stringify


def test_sorts_keys_indents_and_trailing_newline():
    assert canonical_stringify({"b": 1, "a": [2, {"d": 4, "c": 3}]}) == (
        '{\n  "a": [\n    2,\n    {\n      "c": 3,\n      "d": 4\n    }\n  ],\n  "b": 1\n}\n'
    )


def test_non_ascii_emitted_raw():
    assert canonical_stringify({"x": "café 😀"}) == '{\n  "x": "café 😀"\n}\n'


def test_empty_containers():
    assert canonical_stringify({"a": [], "b": {}}) == '{\n  "a": [],\n  "b": {}\n}\n'
