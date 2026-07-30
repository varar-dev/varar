# frozen_string_literal: true

require 'rspec/core'
require 'varar/runner'

module Varar
  # RSpec adapter. One call defines an RSpec example group per oath matched by
  # varar.config.json, with one `it` per Markdown example (header-bound rows are
  # separate examples) and a drift gate. See ADR 0005.
  #
  #   # spec/varar_spec.rb
  #   require "varar/rspec"
  #   Varar::RSpec.generate
  module RSpec
    VERSION = '0.7.0'

    module_function

    def generate(root: nil)
      root ||= File.dirname(caller_locations(1, 1).first.path)
      root = File.expand_path(root)
      cfg = Config.read_config(root)
      loaded = Runner.load_steps(cfg.steps, root)
      store = Runner.create_file_baseline_store(root)
      update = %w[1 true].include?(ENV.fetch('VARAR_UPDATE', nil))

      oaths = Runner.find_oaths(cfg.docs_include, cfg.docs_exclude, root)
      # Run results for the language server (ADR 0014). RSpec has no per-oath
      # completion hook here, so each group flushes its own oath in after(:all).
      results = Runner::Results.new

      # Drop baselines for oaths the config no longer discovers. Reconciliation is
      # per-oath and never sees a path that has gone, so the lock would otherwise
      # accumulate dead entries forever (#70). Once per run, keyed off the config
      # globs — which here IS the full set, since generate always discovers
      # everything.
      Core::Drifts.prune_baselines(store, oaths.map { |p| Runner.rel_posix(p, root) }, update: update)

      oaths.each do |oath_path|
        define_group(oath_path, root, loaded, store, update, results)
      end
    end

    def define_group(oath_path, root, loaded, store, update, results)
      rel = Runner.rel_posix(oath_path, root)
      source = File.read(oath_path, encoding: 'UTF-8')
      plan = Runner.plan_oath(File.basename(oath_path), source, loaded.registry)
      pairs = Runner.examples_with_runs(plan, loaded.create_context, Runner::RecordingReporter.new)
      drifts = Core::Drifts.reconcile_drift(store, rel, source, plan.doc, plan, update: update)

      ::RSpec.describe(rel) do
        pairs.each do |example, run|
          lines = example.steps.map { |s| s.match_span.start_line }.uniq
          # A var diff surfaces as a failure carrying the span-anchored render;
          # any other exception propagates. RSpec reports both as failures.
          it(example.name) do
            run.call
          rescue StandardError => e
            # Recorded here, where the error object is still in hand: to_failure
            # reads the anchor the executor attached to it.
            results.record(rel, source, Core::ExampleResult.new(
                                          name: example.name, status: 'failed', lines: lines,
                                          failure: Core::Failures.to_failure(e, rel, lines.first || 0)
                                        ))
            raise Runner.render_failure(e, source, rel) if RSpec.var_diff_error?(e)

            raise
          else
            results.record(rel, source, Core::ExampleResult.new(
                                          name: example.name, status: 'passed', lines: lines, failure: nil
                                        ))
          end
        end

        drifts.each do |drift|
          message = Core::Diagnostics.drift_detected(drift.name, drift.span).message
          it("var drift at line #{drift.line}") { raise message }
        end

        # This oath's examples are all in — write its results. A passing oath is
        # written too: a stale file would keep a diagnostic on screen that this
        # run has just cleared.
        after(:all) { results.flush(root, rel) }
      end
    end

    def var_diff_error?(error)
      error.is_a?(Core::CellMismatchError) ||
        error.is_a?(Core::ReturnShapeError) || error.is_a?(Core::UnexpectedPassError)
    end
  end
end
