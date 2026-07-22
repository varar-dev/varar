"""Registry for step definitions — port of var-core/src/registry.ts."""
from __future__ import annotations

from dataclasses import dataclass, field
from re import Pattern
from typing import Any, Callable, Mapping, Optional, Union

from cucumber_expressions.expression import CucumberExpression
from cucumber_expressions.parameter_type import ParameterType
from cucumber_expressions.parameter_type_registry import ParameterTypeRegistry

from varar_core.step_role import StepKind

# A step handler: receives the context state plus any matched arguments
StepHandler = Callable[..., Any]

# Accepted regexp forms for define_parameter_type
RegexpInput = Union[str, Pattern, list[Union[str, Pattern]]]

# A parameter type's display formatter: value -> the document's notation.
# Presentation only — never part of matching or comparison verdicts.
ParameterFormat = Callable[[Any], str]


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
    # Per parameter-type display formatters, keyed by type name. Kept beside
    # the cucumber-expressions registry because ParameterType can't carry one.
    formats: Mapping[str, ParameterFormat] = field(default_factory=dict)


# Markdown emphasis, as a built-in {emph} parameter type. Matches the uniform
# emphasis notations (bold-italic, bold, italic; ``*`` and ``_`` delimiters),
# ordered longest-delimiter-first so ``**x**`` isn't half-eaten by the ``*``
# branch. Each branch captures the inner text in its own group, so only the
# outermost delimiter pair is stripped (``**_x_**`` -> ``_x_``) and editors
# highlight the value, not the markers.
EMPH_REGEXP = r"\*\*\*([^*]+)\*\*\*|___([^_]+)___|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_"


def _seed_builtins(registry: Registry) -> Registry:
    """Seed var's own built-in parameter types (beyond cucumber-expressions'
    int/float/string/word). Shared by every port so specs match identically.
    """
    return define_parameter_type(
        registry,
        name="emph",
        regexp=EMPH_REGEXP,
        # Exactly one alternation branch matches, so exactly one group is set.
        parse=lambda *groups: next((g for g in groups if g is not None), ""),
        # Emphasis is distinctive notation; don't auto-suggest it in snippets.
        use_for_snippets=False,
        # Mismatch display renders the value back in single-asterisk emphasis.
        format=lambda value: f"*{value}*",
    )


def create_registry() -> Registry:
    """Return a registry seeded with var's built-in parameter types."""
    empty = Registry(steps=(), parameter_types=ParameterTypeRegistry(), formats={})
    return _seed_builtins(empty)


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
    return Registry(
        steps=(*registry.steps, reg),
        parameter_types=registry.parameter_types,
        formats=registry.formats,
    )


def define_parameter_type(
    registry: Registry,
    *,
    name: str,
    regexp: RegexpInput,
    parse: Optional[Callable[..., Any]] = None,
    use_for_snippets: bool = True,
    prefer_for_regexp_match: bool = False,
    format: Optional[ParameterFormat] = None,
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

    # Default parse: identity — return the first (and usually only) group
    effective_parse: Callable[..., Any] = parse if parse is not None else (
        lambda *groups: groups[0]
    )

    pt: ParameterType = ParameterType(
        name,
        regexps,
        None,
        effective_parse,
        use_for_snippets,
        prefer_for_regexp_match,
    )
    registry.parameter_types.define_parameter_type(pt)
    if format is None:
        # Return the same object — the mutation is in the ParameterTypeRegistry
        return registry
    return Registry(
        steps=registry.steps,
        parameter_types=registry.parameter_types,
        formats={**registry.formats, name: format},
    )
