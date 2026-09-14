# frozen_string_literal: true

require 'minitest'
require 'varar/runner'

module Varar
  # Minitest adapter. One call turns every oath matched by varar.config.json into
  # a generated Minitest::Test subclass — one class per oath file, one test
  # method per example. Mirrors varar-unittest.
  #
  #   # test/varar_test.rb
  #   require "varar/minitest"
  #   Varar::Minitest.generate_tests
  module Minitest
    VERSION = '0.8.0'

    module_function

    def generate_tests(namespace = Object, root: nil)
      root ||= File.dirname(caller_locations(1, 1).first.path)
      root = File.expand_path(root)
      cfg = Config.read_config(root)
      loaded = Runner.load_steps(cfg.steps, root)
      store = Runner.create_file_baseline_store(root)
      update = %w[1 true].include?(ENV.fetch('VARAR_UPDATE', nil))

      oaths = Runner.find_oaths(cfg.docs_include, cfg.docs_exclude, root)
      # Run results for the language server (ADR 0014). Minitest.after_run, not
      # at_exit: at_exit handlers run last-registered-first, so ours would fire
      # before Minitest's own — i.e. before a single test had run.
      results = Runner::Results.new
      ::Minitest.after_run { results.flush_all(root) }

      # Drop baselines for oaths the config no longer discovers. Reconciliation is
      # per-oath and never sees a path that has gone, so the lock would otherwise
      # accumulate dead entries forever (#70). Once per run, keyed off the config
      # globs — which here IS the full set, since generate_tests always discovers
      # everything.
      Core::Drifts.prune_baselines(store, oaths.map { |p| Runner.rel_posix(p, root) }, update: update)

      workspace = project_workspace(oaths, root)

      oaths.each do |oath_path|
        klass = build_test_case(oath_path, root, loaded, store, update, results, workspace)
        namespace.const_set("Var_#{identifier(Runner.rel_posix(oath_path, root))}", klass)
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

    def build_test_case(oath_path, root, loaded, store, update, results, workspace)
      rel = Runner.rel_posix(oath_path, root)
      source = File.read(oath_path, encoding: 'UTF-8')
      # `rel`, not the basename: doc.path is an oath's identity in every port,
      # so a relative reference resolves alike and two same-named oaths in
      # different directories stay distinct (ADR 0016).
      plan = Runner.plan_oath(rel, source, loaded.registry, workspace)
      referenced = referenced_sources(plan, workspace)
      pairs = Runner.examples_with_runs(plan, loaded.create_context, Runner::RecordingReporter.new)

      klass = Class.new(::Minitest::Test)
      seen = Hash.new(0)
      pairs.each do |example, run|
        base = example.scope_stack.last || example.name
        stem = identifier(base)
        idx = seen[stem]
        seen[stem] += 1
        method_name = idx.zero? ? "test_#{stem}" : "test_#{stem}_#{idx}"
        # Lines in THIS oath: a step a reference block spliced in from another
        # oath (ADR 0016) contributes none, since its line is not in this file.
        lines = example.steps.reject(&:doc_path).map { |step| step.match_span.start_line }.uniq
        klass.define_method(method_name) do
          run.call
        rescue StandardError => e
          # Recorded here, where the error object is still in hand: to_failure
          # reads the anchor the executor attached to it.
          results.record(rel, source, Core::ExampleResult.new(
                                        name: example.name, status: 'failed', lines: lines,
                                        failure: Core::Failures.to_failure(e, rel, lines.first || 0)
                                      ), referenced)
          raise ::Minitest::Assertion, Runner.render_failure(e, source, rel) if Minitest.var_diff_error?(e)

          raise
        else
          results.record(rel, source, Core::ExampleResult.new(
                                        name: example.name, status: 'passed', lines: lines, failure: nil
                                      ), referenced)
        end
      end

      Core::Drifts.reconcile_drift(store, rel, source, plan.doc, plan, update: update).each do |drift|
        message = Core::Diagnostics.drift_detected(drift.name, drift.span).message
        klass.define_method("test_var_drift_#{drift.line}") { raise ::Minitest::Assertion, message }
      end

      klass
    end

    # A markdown/return mismatch is a test failure (Minitest::Assertion); any
    # other exception propagates as an error.
    def var_diff_error?(error)
      error.is_a?(Core::CellMismatchError) ||
        error.is_a?(Core::ReturnShapeError) || error.is_a?(Core::UnexpectedPassError)
    end

    # Project arbitrary text onto a valid identifier fragment.
    def identifier(text)
      ident = text.gsub(/\W+/, '_').gsub(/\A_+|_+\z/, '')
      ident = 'example' if ident.empty?
      ident = "_#{ident}" if ident.match?(/\A\d/)
      ident
    end
  end
end
