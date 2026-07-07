# frozen_string_literal: true

# Coverage is opt-in (COVERAGE=1, set by `make coverage`) so the ordinary test
# run stays fast. Start it before any gem under test loads — spec files require
# their gem after this helper — so every line counts. Emits HTML + an lcov file
# alongside the other ports (typescript/coverage/lcov.info, python/coverage.lcov).
if ENV['COVERAGE']
  require 'simplecov'
  require 'simplecov-lcov'

  SimpleCov::Formatter::LcovFormatter.config do |c|
    c.report_with_single_file = true
    c.single_report_path = 'coverage/lcov.info'
  end
  SimpleCov.formatters = [
    SimpleCov::Formatter::HTMLFormatter,
    SimpleCov::Formatter::LcovFormatter
  ]
  SimpleCov.start do
    add_filter %r{/spec/}
    add_filter %r{/test/}
  end
end

# Shared across every gem's suite. The gems' lib dirs are on the load path via
# Bundler (path gems in the Gemfile), so each spec requires the gem it exercises.
RSpec.configure do |config|
  config.disable_monkey_patching!
  config.expect_with(:rspec) { |c| c.syntax = :expect }
end
