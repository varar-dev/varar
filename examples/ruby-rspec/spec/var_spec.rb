# frozen_string_literal: true

# Turn every Markdown spec matched by var.config.json into RSpec examples —
# one `it` per Markdown example, discovered when this file loads.
require "oselvar/var/rspec"

# var.config.json lives at the project root (the parent of spec/).
Oselvar::Var::RSpec.generate(root: File.expand_path("..", __dir__))
