# frozen_string_literal: true

# Turn every Markdown spec matched by varar.config.json into RSpec examples —
# one `it` per Markdown example, discovered when this file loads.
require 'varar/rspec'

# varar.config.json lives at the project root (the parent of spec/).
Varar::RSpec.generate(root: File.expand_path('..', __dir__))
