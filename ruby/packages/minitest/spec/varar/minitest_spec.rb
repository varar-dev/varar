# frozen_string_literal: true

require 'spec_helper'
require 'tmpdir'
require 'fileutils'
require 'varar/minitest'

module Varar
  ::RSpec.describe Minitest do
    def corpus_dir
      dir = __dir__
      dir = File.dirname(dir) until File.directory?(File.join(dir, 'conformance', 'bundles')) || dir == '/'
      File.join(dir, 'conformance', 'bundles')
    end

    # Build a throwaway project from a conformance bundle (its example.md +
    # *.steps.rb) with a matching varar.config.json.
    def project_from_bundle(tmp, bundle, oath_name)
      src = File.join(corpus_dir, bundle)
      FileUtils.mkdir_p(File.join(tmp, 'steps'))
      FileUtils.cp(File.join(src, 'example.md'), File.join(tmp, oath_name))
      FileUtils.cp(Dir.glob(File.join(src, '*.steps.rb')).first, File.join(tmp, 'steps'))
      File.write(File.join(tmp, 'varar.config.json'),
                 '{"docs":{"include":["*.md"]},"steps":["steps/*.steps.rb"]}')
    end

    it 'generates one Test subclass per oath with a passing method for a passing example' do
      Dir.mktmpdir do |tmp|
        project_from_bundle(tmp, '01-roman-numerals', 'pass.md')
        namespace = Module.new
        described_class.generate_tests(namespace, root: tmp)

        klass = namespace.constants.map { |c| namespace.const_get(c) }.first
        expect(klass.ancestors).to include(::Minitest::Test)
        methods = klass.instance_methods(false).grep(/^test_/)
        expect(methods).not_to be_empty
        methods.each do |m|
          expect { klass.new(m.to_s).public_send(m) }.not_to raise_error
        end
      end
    end

    it 'a doc-string mismatch surfaces as a Minitest::Assertion (a failure)' do
      Dir.mktmpdir do |tmp|
        project_from_bundle(tmp, '06-doc-string-mismatch', 'fail.md')
        namespace = Module.new
        described_class.generate_tests(namespace, root: tmp)

        klass = namespace.constants.map { |c| namespace.const_get(c) }.first
        method = klass.instance_methods(false).grep(/^test_/).first
        expect { klass.new(method.to_s).public_send(method) }.to raise_error(::Minitest::Assertion)
      end
    end

    # The drift gate (ADR 0002). Having the drift machinery available is not the
    # same as calling it — an adapter can be fully conformance-green and reconcile
    # nothing (issue #69). The end-to-end counterpart is the adapter smoke
    # contract, which runs the real `rake test` against a drifted baseline; see
    # conformance/adapter/README.md.
    describe 'the drift gate' do
      # A prose paragraph the plan never turns into an example, followed by one it
      # does. Recording the prose in the baseline is what a renamed or deleted step
      # definition leaves behind — the same probe conformance/adapter/smoke.sh uses.
      let(:prose) { "You're really not going to like it" }

      def drift_project(tmp, prose)
        FileUtils.mkdir_p(File.join(tmp, 'steps'))
        File.write(File.join(tmp, 'varar.config.json'),
                   '{"docs":{"include":["*.md"]},"steps":["steps/*.steps.rb"]}')
        File.write(File.join(tmp, 'w.md'), "#{prose}.\n\nlife, the universe and everything is 42.\n")
        File.write(File.join(tmp, 'steps', 'w.steps.rb'), <<~RUBY)
          # frozen_string_literal: true
          require 'varar'
          steps do
            sensor('life, the universe and everything is {int}') { 42 }
          end
        RUBY
      end

      def drifted_baseline(tmp, prose)
        File.write(File.join(tmp, 'varar.lock.json'), <<~JSON)
          {
            "version": 2,
            "oaths": {
              "w.md": {
                "sourceHash": "fnv1a:00000000",
                "examples": [{ "name": #{prose.inspect}, "line": 1 }]
              }
            }
          }
        JSON
      end

      it 'records the baseline on a clean run' do
        Dir.mktmpdir do |tmp|
          drift_project(tmp, prose)
          described_class.generate_tests(Module.new, root: tmp)
          expect(File.read(File.join(tmp, 'varar.lock.json'))).to include('w.md')
        end
      end

      it 'defines a failing test method per drift, and preserves the baseline' do
        Dir.mktmpdir do |tmp|
          drift_project(tmp, prose)
          drifted_baseline(tmp, prose)
          before = File.read(File.join(tmp, 'varar.lock.json'))

          namespace = Module.new
          described_class.generate_tests(namespace, root: tmp)
          klass = namespace.constants.map { |c| namespace.const_get(c) }.first
          drift_methods = klass.instance_methods(false).grep(/^test_var_drift_/)

          expect(drift_methods).not_to be_empty
          drift_methods.each do |m|
            expect { klass.new(m.to_s).public_send(m) }
              .to raise_error(::Minitest::Assertion, /no longer matches any step/)
          end
          # The baseline is preserved, not silently re-recorded, while drift stands.
          expect(File.read(File.join(tmp, 'varar.lock.json'))).to eq(before)
        end
      end

      it 'accepts the drift and re-records with VARAR_UPDATE=1' do
        Dir.mktmpdir do |tmp|
          drift_project(tmp, prose)
          drifted_baseline(tmp, prose)
          namespace = Module.new
          ENV['VARAR_UPDATE'] = '1'
          begin
            described_class.generate_tests(namespace, root: tmp)
          ensure
            ENV.delete('VARAR_UPDATE')
          end

          klass = namespace.constants.map { |c| namespace.const_get(c) }.first
          expect(klass.instance_methods(false).grep(/^test_var_drift_/)).to be_empty
          expect(File.read(File.join(tmp, 'varar.lock.json'))).not_to include(prose)
        end
      end
    end
  end
end
