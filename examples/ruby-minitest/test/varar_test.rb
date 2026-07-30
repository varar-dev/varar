# frozen_string_literal: true

require 'minitest/autorun'
require 'varar/minitest'

# Turn every Markdown oath matched by varar.config.json into Minitest tests —
# one Test subclass per oath, one test method per Markdown example.
# varar.config.json lives at the project root (the parent of test/).
Varar::Minitest.generate_tests(Object, root: File.expand_path('..', __dir__))
