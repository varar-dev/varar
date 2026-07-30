# frozen_string_literal: true

require 'json'

module Varar
  module Core
    # Writes varar.lock.json the way JS `JSON.stringify(v, null, 2)` does:
    # 2-space indent, LF, trailing newline, non-ASCII raw, empty containers as
    # {}/[], keys in insertion order.
    #
    # A committed, language-shared file, so the layout is hand-rolled rather
    # than left to JSON.pretty_generate, which renders empty arrays/objects as
    # "[\n\n]" — a Ruby run would otherwise churn the file against every other
    # port's. Scalar encoding is delegated to the stdlib, which matches JS
    # (escapes " \ control chars, keeps non-ASCII raw).
    #
    # Conformance goldens are NOT compared through here: a port has to agree
    # with the goldens' CONTENT, and every spec parses them and compares deep
    # equality.
    module CanonicalJson
      module_function

      def ordered_stringify(value)
        "#{encode(value, '')}\n"
      end

      def encode(value, indent)
        case value
        when Hash
          return '{}' if value.empty?

          inner = "#{indent}  "
          items = value.keys.map { |key| "#{inner}#{key.to_s.to_json}: #{encode(value[key], inner)}" }
          "{\n#{items.join(",\n")}\n#{indent}}"
        when Array
          return '[]' if value.empty?

          inner = "#{indent}  "
          items = value.map { |element| "#{inner}#{encode(element, inner)}" }
          "[\n#{items.join(",\n")}\n#{indent}]"
        else
          value.to_json
        end
      end
    end
  end
end
