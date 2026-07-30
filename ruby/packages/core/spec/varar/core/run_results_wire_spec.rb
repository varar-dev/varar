# frozen_string_literal: true

require 'json'
require 'spec_helper'
require 'varar/core'

module Varar
  module Core
    # The cross-port wire format of .varar/<oath_path>.json (ADR 0014). Every port
    # builds this same value and must serialize it byte-for-byte identically — see
    # conformance/run-results/README.md for what that pins, and why the bundle
    # goldens don't cover it.
    ::RSpec.describe Results do
      let(:expected_path) do
        File.expand_path('../../../../../../conformance/run-results/expected.json', __dir__)
      end

      let(:results) do
        OathResults.new(
          version: 1,
          oath_path: 'varar/library.md',
          source_hash: 'fnv1a:1622dfca',
          examples: [
            ExampleResult.new(
              name: 'Maya borrowed *Emma*, due back on June 1, 2026',
              status: 'passed', lines: [3, 4], failure: nil
            ),
            ExampleResult.new(
              name: 'Ben borrowed *Dune* for £2.50 & kept it',
              status: 'failed', lines: [13, 14],
              failure: ExampleFailure.new(
                line: 14,
                message: "expected £2.50 but was £3.00\nand the library <refused>",
                stack: '<stack>',
                cells: [CellFailure.new(from: 71, to: 77, actual: '£3.00')],
                anchor: AnchorRange.new(from: 60, to: 90)
              )
            ),
            ExampleResult.new(
              name: 'Noor borrowed *Kindred*',
              status: 'failed', lines: [8, 9],
              failure: ExampleFailure.new(
                line: 9, message: 'expected the library to refuse', stack: '<stack>'
              )
            )
          ]
        )
      end

      it 'matches the cross-port fixture byte for byte' do
        written = "#{JSON.pretty_generate(described_class.to_wire(results))}\n"
        expect(written).to eq(File.read(expected_path, encoding: 'UTF-8'))
      end
    end
  end
end
