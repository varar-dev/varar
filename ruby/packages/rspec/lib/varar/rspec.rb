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
    VERSION = '0.8.0'

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

      workspace = project_workspace(oaths, root)

      oaths.each do |oath_path|
        define_group(oath_path, root, loaded, store, update, results, workspace)
      end
    end

    # Whether a section is a standalone example depends on whether another oath
    # references it, which is whole-project knowledge (ADR 0016). Built from the
    # config globs — the full set, for the same reason baseline pruning is.
    # The sources of every oath this plan's steps were spliced in from (ADR
    # 0016). Their hashes go in the run record, so a consumer can tell a stale
    # failure from a live one.
    def referenced_sources(plan, workspace)
      plan.examples.flat_map { |ex| ex.steps.map(&:doc_path) }.compact.uniq.each_with_object({}) do |path, out|
        doc = workspace.docs[path]
        out[path] = doc.source if doc
      end
    end

    def project_workspace(oaths, root)
      docs = oaths.filter_map do |path|
        Core::Parse.parse(Runner.rel_posix(path, root), File.read(path, encoding: 'UTF-8'))
      rescue SystemCallError
        nil
      end
      Core::Reference.build_workspace(docs)
    end

    def define_group(oath_path, root, loaded, store, update, results, workspace)
      rel = Runner.rel_posix(oath_path, root)
      source = File.read(oath_path, encoding: 'UTF-8')
      # `rel`, not the basename: doc.path is an oath's identity in every port,
      # so a relative reference resolves alike and two same-named oaths in
      # different directories stay distinct (ADR 0016).
      plan = Runner.plan_oath(rel, source, loaded.registry, workspace)
      referenced = referenced_sources(plan, workspace)
      pairs = Runner.examples_with_runs(plan, loaded.create_context, Runner::RecordingReporter.new)
      drifts = Core::Drifts.reconcile_drift(store, rel, source, plan.doc, plan, update: update)

      ::RSpec.describe(rel) do
        pairs.each do |example, run|
          # Lines in THIS oath: a step a reference block spliced in from
          # another oath (ADR 0016) contributes none, since its line is not in
          # this file.
          lines = example.steps.reject(&:doc_path).map { |s| s.match_span.start_line }.uniq
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
                                        ), referenced)
            raise Runner.render_failure(e, source, rel) if RSpec.var_diff_error?(e)

            raise
          else
            results.record(rel, source, Core::ExampleResult.new(
                                          name: example.name, status: 'passed', lines: lines, failure: nil
                                        ), referenced)
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
