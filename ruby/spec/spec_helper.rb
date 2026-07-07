# frozen_string_literal: true

# Shared across every gem's suite. The gems' lib dirs are on the load path via
# Bundler (path gems in the Gemfile), so each spec requires the gem it exercises.
RSpec.configure do |config|
  config.disable_monkey_patching!
  config.expect_with(:rspec) { |c| c.syntax = :expect }
end
