# frozen_string_literal: true

module Oselvar
  module Var
    # The pure functional core: parse, match, plan, execute, diffs, drift, and
    # the conformance projections. No filesystem, network, globals, or time.
    module Core
      VERSION = "0.3.2"
    end
  end
end

require "oselvar/var/core/span"
