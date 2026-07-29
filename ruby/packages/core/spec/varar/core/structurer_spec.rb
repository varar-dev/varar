# frozen_string_literal: true

require 'spec_helper'
require 'varar/core'

module Varar
  module Core
    # The structurer is pure syntax: one candidate per paragraph/list-item/
    # blockquote, with trailing tables/fences attached, and a
    # +preceded_by_delimiter+ flag the planner groups on (ADR 0012).
    ::RSpec.describe Structurer do
      def structure(source)
        described_class.structure('d.md', source, Scanner.scan(source))
      end

      it 'marks candidates after a heading or thematic break as preceded_by_delimiter' do
        source = "First para.\n\nSecond para.\n\n---\n\nThird para.\n\n## H\n\nFourth para."
        doc = structure(source)
        expect(doc.examples.map(&:preceded_by_delimiter)).to eq([
                                                                  true, # first candidate in the file
                                                                  false, # adjacent paragraph, no delimiter
                                                                  true,  # after `---`
                                                                  true   # after a heading
                                                                ])
      end

      it 'attaches a trailing table without merging the following paragraph (no hug)' do
        source = "A step.\n\n| a |\n| - |\n| 1 |\n\nAnother step."
        doc = structure(source)
        # Two candidates: the table attaches to the first; the second paragraph
        # is its own candidate (the hug is gone — ADR 0012).
        expect(doc.examples.length).to eq(2)
        expect(doc.examples[0].body.map(&:kind)).to eq(%w[paragraph table])
        expect(doc.examples[1].body.map(&:kind)).to eq(['paragraph'])
        expect(doc.examples[1].preceded_by_delimiter).to be(false)
      end
    end
  end
end
