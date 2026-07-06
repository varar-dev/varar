"""Turns every Markdown spec matched by var.config.json into unittest tests."""

from var_unittest import generate_tests

generate_tests(globals())
