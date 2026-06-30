"""Adapter-only glue (mirrors @oselvar/var/registry): build the registry and
context factory from the module-scope accumulator, and reset it between runs."""

from var.internal import _reset_builder, build_registry, context_factory

__all__ = ["build_registry", "context_factory", "_reset_builder"]
