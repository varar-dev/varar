"""Adapter-only glue (mirrors @varar/varar/registry): build the registry and
context factory from the module-scope accumulator, and reset it between runs."""

from varar.internal import _custom_parameter_types, _reset_builder, build_registry, context_factory

__all__ = ["build_registry", "context_factory", "_reset_builder", "_custom_parameter_types"]
