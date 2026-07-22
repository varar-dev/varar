# frozen_string_literal: true

require 'cucumber/cucumber_expressions/cucumber_expression'
require 'cucumber/cucumber_expressions/parameter_type'
require 'cucumber/cucumber_expressions/parameter_type_registry'

module Varar
  module Core
    # One registered step definition. `compiled` is the CucumberExpression.
    StepRegistration = Data.define(
      :expression, :expression_source_file, :expression_source_line,
      :handler, :compiled, :kind
    )

    # A registry of step definitions plus the shared cucumber ParameterTypeRegistry
    # and per-type display formatters (kept beside it because ParameterType
    # can't carry one). Port of registry.ts.
    Registry = Data.define(:steps, :parameter_types, :formats)

    module Registries
      module_function

      # Markdown emphasis, as a built-in {emph} parameter type. Matches the
      # uniform emphasis notations (bold-italic, bold, italic; `*` and `_`
      # delimiters), ordered longest-delimiter-first so `**x**` isn't
      # half-eaten by the `*` branch. Each branch captures the inner text in
      # its own group, so only the outermost delimiter pair is stripped
      # (`**_x_**` -> `_x_`). Byte-identical to the TS port's EMPH_REGEXP.
      EMPH_REGEXP = '\*\*\*([^*]+)\*\*\*|___([^_]+)___|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_'

      def create_registry
        seed_builtins(
          Registry.new(
            steps: [],
            parameter_types: Cucumber::CucumberExpressions::ParameterTypeRegistry.new,
            formats: {}
          )
        )
      end

      # Seed var's own built-in parameter types (beyond cucumber-expressions'
      # int/float/string/word). Shared by every port so specs match
      # identically. Built-ins are NOT tracked as custom parameter types, so
      # they never appear in the conformance registry.json projection.
      def seed_builtins(registry)
        define_parameter_type(
          registry,
          name: 'emph',
          regexp: EMPH_REGEXP,
          # Exactly one alternation branch matches, so exactly one group is set.
          parse: ->(*groups) { groups.find { |g| !g.nil? } || '' },
          # Emphasis is distinctive notation; don't auto-suggest it in snippets.
          use_for_snippets: false,
          # Mismatch display renders the value back in single-asterisk emphasis.
          format: ->(value) { "*#{value}*" }
        )
      end

      # Compile +expression+ and append it. Returns a new Registry (the
      # ParameterTypeRegistry is shared by reference but never mutated here).
      # Raises on duplicate expressions, mirroring the TS message.
      def add_step(registry, expression:, expression_source_file:, expression_source_line:, handler:, kind: nil)
        duplicate = registry.steps.find { |s| s.expression == expression }
        if duplicate
          raise "duplicate step definition for \"#{expression}\" at " \
                "#{duplicate.expression_source_file}:#{duplicate.expression_source_line} and " \
                "#{expression_source_file}:#{expression_source_line}"
        end

        compiled = Cucumber::CucumberExpressions::CucumberExpression.new(expression, registry.parameter_types)
        reg = StepRegistration.new(
          expression: expression,
          expression_source_file: expression_source_file,
          expression_source_line: expression_source_line,
          handler: handler,
          compiled: compiled,
          kind: kind
        )
        registry.with(steps: registry.steps + [reg])
      end

      # Register a custom parameter type with the shared ParameterTypeRegistry
      # (mutated in place, same as TS, so previously compiled expressions gain
      # the new type). Returns the same Registry unless a +format+ is given.
      def define_parameter_type(registry, name:, regexp:, parse: nil, use_for_snippets: true,
                                prefer_for_regexp_match: false, format: nil)
        regexps = regexp.is_a?(Array) ? regexp : [regexp]
        transformer = parse || ->(*groups) { groups[0] }
        # `type` is return-type metadata only (used by snippet generation, never
        # by matching, transformation, or any conformance artifact). The Ruby
        # gem rejects a nil type (Python's accepts None), so pass Object.
        pt = Cucumber::CucumberExpressions::ParameterType.new(
          name, regexps, Object, transformer, use_for_snippets, prefer_for_regexp_match
        )
        registry.parameter_types.define_parameter_type(pt)
        return registry if format.nil?

        registry.with(formats: registry.formats.merge(name => format))
      end
    end
  end
end
