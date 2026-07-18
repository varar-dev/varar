"""deep_freeze.py — port of var-core/src/deep-freeze.ts.

Recursively makes plain dicts read-only (types.MappingProxyType) and plain
lists into tuples so that handler code mutating state raises TypeError.

Class instances (any value whose type is not plain dict or list), primitives,
None, MappingProxyType, and tuples pass through unchanged.  Assumes acyclic
input (test state is).
"""
from __future__ import annotations

import types
from typing import Any


def deep_freeze(value: Any) -> Any:
    """Recursively freeze plain data.

    - dict            → types.MappingProxyType (recursively frozen values)
    - list            → tuple (recursively frozen elements)
    - MappingProxyType / tuple → pass through unchanged (already immutable)
    - class instances, primitives, None → pass through unchanged
    """
    if value is None:
        return value
    # Already-immutable wrappers: return the same reference (idempotent).
    if isinstance(value, types.MappingProxyType):
        return value
    if isinstance(value, tuple):
        return value
    # Plain dict (not a subclass) → MappingProxyType with recursively frozen values.
    if type(value) is dict:
        return types.MappingProxyType({k: deep_freeze(v) for k, v in value.items()})
    # Plain list (not a subclass) → tuple with recursively frozen elements.
    if type(value) is list:
        return tuple(deep_freeze(v) for v in value)
    # Everything else (class instances, int, str, float, bool, bytes, …)
    # passes through unchanged — class instances keep their mutating methods.
    return value
