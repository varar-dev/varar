"""Registry for step definitions — port of var-core/src/registry.ts."""
from __future__ import annotations

from dataclasses import dataclass
from re import Pattern
from typing import Any, Callable, Optional, Union

from cucumber_expressions.expression import CucumberExpression
from cucumber_expressions.parameter_type import ParameterType
from cucumber_expressions.parameter_type_registry import ParameterTypeRegistry

from var_core.step_role import StepKind

# A step handler: receives the context state plus any matched arguments
StepHandler = Callable[..., Any]

# Accepted regexp forms for define_parameter_type
RegexpInput = Union[str, Pattern, list[Union[str, Pattern]]]


@dataclass(frozen=True)
class StepRegistration:
    expression: str
    expression_source_file: str
    expression_source_line: int
    handler: StepHandler
    compiled: CucumberExpression
    kind: Optional[StepKind] = None


@dataclass(frozen=True)
class Registry:
    steps: tuple[StepRegistration, ...]
    parameter_types: ParameterTypeRegistry


def create_registry() -> Registry:
    """Return an empty registry with a fresh default ParameterTypeRegistry."""
    return Registry(steps=(), parameter_types=ParameterTypeRegistry())


def add_step(
    registry: Registry,
    *,
    expression: str,
    expression_source_file: str,
    expression_source_line: int,
    handler: StepHandler,
    kind: Optional[StepKind] = None,
) -> Registry:
    """Compile *expression* and append it to *registry*.

    Returns a new Registry; the original is unchanged (ParameterTypeRegistry is
    shared by reference — see note in TS source — but never mutated here).

    Raises ValueError on duplicate expressions, mirroring the TS error message.
    """
    duplicate = next((s for s in registry.steps if s.expression == expression), None)
    if duplicate is not None:
        raise ValueError(
            f'duplicate step definition for "{expression}" at '
            f"{duplicate.expression_source_file}:{duplicate.expression_source_line} and "
            f"{expression_source_file}:{expression_source_line}"
        )
    compiled = CucumberExpression(expression, registry.parameter_types)
    reg = StepRegistration(
        expression=expression,
        expression_source_file=expression_source_file,
        expression_source_line=expression_source_line,
        handler=handler,
        compiled=compiled,
        kind=kind,
    )
    return Registry(steps=(*registry.steps, reg), parameter_types=registry.parameter_types)


def define_parameter_type(
    registry: Registry,
    *,
    name: str,
    regexp: RegexpInput,
    transformer: Optional[Callable[..., Any]] = None,
    use_for_snippets: bool = True,
    prefer_for_regexp_match: bool = False,
) -> Registry:
    """Register a custom parameter type with the shared ParameterTypeRegistry.

    The registry's ParameterTypeRegistry is mutated in place (same semantics as
    the TS implementation), so previously compiled CucumberExpressions also gain
    the new type.

    Returns the same Registry object (the mutation is in-place).
    """
    # Normalise regexp to a list so ParameterType always receives a list
    if isinstance(regexp, (str, Pattern)):
        regexps: list[str | Pattern] = [regexp]
    else:
        regexps = list(regexp)

    # Default transformer: identity — return the first (and usually only) group
    effective_transformer: Callable[..., Any] = transformer if transformer is not None else (
        lambda *groups: groups[0]
    )

    pt: ParameterType = ParameterType(
        name,
        regexps,
        None,
        effective_transformer,
        use_for_snippets,
        prefer_for_regexp_match,
    )
    registry.parameter_types.define_parameter_type(pt)
    # Return the same object — the mutation is in the ParameterTypeRegistry
    return registry
