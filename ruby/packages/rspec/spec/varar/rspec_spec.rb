# frozen_string_literal: true

require 'spec_helper'
require 'tmpdir'
require 'varar/rspec'

module Varar
  # The RSpec adapter is exercised end-to-end by examples/ruby-rspec (run via
  # the real `rspec` binary). Here we unit-test the failure classification and
  # that generate no-ops cleanly on a project with no oaths.
  ::RSpec.describe RSpec do
    describe '.var_diff_error?' do
      it 'classifies var diff/shape errors as failures' do
        expect(described_class.var_diff_error?(Core::ReturnShapeError.new('x'))).to be(true)
        expect(described_class.var_diff_error?(Core::UnexpectedPassError.new)).to be(true)
        expect(described_class.var_diff_error?(Core::CellMismatchError.new([]))).to be(true)
      end

      it 'does not classify arbitrary errors as failures' do
        expect(described_class.var_diff_error?(RuntimeError.new('boom'))).to be(false)
      end
    end

    it 'generate no-ops when the project has no specs' do
      Dir.mktmpdir do |tmp|
        File.write(File.join(tmp, 'varar.config.json'),
                   '{"docs":{"include":["*.md"]},"steps":["steps/*.steps.rb"]}')
        expect { described_class.generate(root: tmp) }.not_to raise_error
      end
    end

    # The drift gate (ADR 0002). `generate` reconciling at all is the thing worth
    # pinning here — an adapter can have every drift function available and never
    # call one (see conformance/adapter/README.md and issue #69). The reported
    # failure itself is gated end-to-end by the adapter smoke contract, which runs
    # the real `rspec` binary against a drifted baseline.
    describe 'the drift gate' do
      # `generate` registers example groups in the global RSpec world. Restore it,
      # so these specs cannot perturb the suite that is running them.
      around do |example|
        registered = ::RSpec.world.example_groups.dup
        example.run
        ::RSpec.world.example_groups.replace(registered)
      end

      # A prose paragraph the plan never turns into an example, followed by one it
      # does. Recording the prose in the baseline is what a renamed or deleted step
      # definition leaves behind — the same probe conformance/adapter/smoke.sh uses.
      let(:prose) { "You're really not going to like it" }
      let(:oath) { "#{prose}.\n\nlife, the universe and everything is 42.\n" }

      def project(tmp)
        File.write(File.join(tmp, 'varar.config.json'),
                   '{"docs":{"include":["*.md"]},"steps":["steps/*.steps.rb"]}')
        File.write(File.join(tmp, 'w.md'), oath)
        Dir.mkdir(File.join(tmp, 'steps'))
        File.write(File.join(tmp, 'steps', 'w.steps.rb'), <<~RUBY)
          # frozen_string_literal: true
          require 'varar'
          steps do
            sensor('life, the universe and everything is {int}') { 42 }
          end
        RUBY
      end

      def drifted_baseline(tmp)
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
          project(tmp)
          described_class.generate(root: tmp)
          expect(File.read(File.join(tmp, 'varar.lock.json'))).to include('w.md')
        end
      end

      it 'defines a failing example per drift, and preserves the baseline' do
        Dir.mktmpdir do |tmp|
          project(tmp)
          drifted_baseline(tmp)
          before = File.read(File.join(tmp, 'varar.lock.json'))

          existing = ::RSpec.world.example_groups.dup
          described_class.generate(root: tmp)
          defined_now = (::RSpec.world.example_groups - existing)
                        .flat_map { |group| group.examples.map(&:description) }

          expect(defined_now).to include(a_string_matching(/drift/))
          # The baseline is preserved, not silently re-recorded, while drift stands.
          expect(File.read(File.join(tmp, 'varar.lock.json'))).to eq(before)
        end
      end

      it 'accepts the drift and re-records with VARAR_UPDATE=1' do
        Dir.mktmpdir do |tmp|
          project(tmp)
          drifted_baseline(tmp)
          ENV['VARAR_UPDATE'] = '1'
          begin
            described_class.generate(root: tmp)
          ensure
            ENV.delete('VARAR_UPDATE')
          end
          expect(File.read(File.join(tmp, 'varar.lock.json'))).not_to include(prose)
        end
      end
    end
  end
end
