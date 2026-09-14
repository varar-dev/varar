# frozen_string_literal: true

require 'json'

require 'spec_helper'
require 'varar'
require 'varar/registry'

module Varar
  # Reproduces the shared conformance corpus' trace.json goldens byte-for-byte
  # (execution stage).
  ::RSpec.describe 'trace conformance' do
    def self.corpus_dir
      dir = __dir__
      dir = File.dirname(dir) until File.directory?(File.join(dir, 'conformance', 'bundles')) || dir == '/'
      File.join(dir, 'conformance', 'bundles')
    end

    corpus = corpus_dir

    # A bundle is one oath (example.md) plus, for a bundle that exercises
    # reference blocks (ADR 0016), the other oaths it links to — every other
    # `.md` in the bundle directory. They are parsed under their bare file
    # names, so `./shared.md` resolves the same way in every port.
    def bundle_docs(dir)
      Dir.glob(File.join(dir, '*.md')).map do |path|
        Core::Parse.parse(File.basename(path), File.read(path, encoding: 'UTF-8'))
      end
    end

    Dir.children(corpus).sort.each do |bundle|
      golden = File.join(corpus, bundle, 'golden', 'trace.json')
      steps_rb = Dir.glob(File.join(corpus, bundle, '*.steps.rb')).first

      it "#{bundle} — trace.json matches golden" do
        raise "no golden for bundle #{bundle}: #{golden}" unless File.exist?(golden)
        raise "no Ruby step fixture (*.steps.rb) for bundle #{bundle}" unless steps_rb

        RegistryGlue.reset_builder
        load steps_rb
        registry = RegistryGlue.build_registry
        create_context = RegistryGlue.context_factory
        docs = bundle_docs(File.join(corpus, bundle))
        doc = docs.find { |d| d.path == 'example.md' }
        artifacts = Core::Conformance.run_conformance(
          doc, registry, create_context, RegistryGlue.custom_parameter_types,
          Core::Reference.build_workspace(docs)
        )
        actual = artifacts[:trace]
        expect(actual).to eq(JSON.parse(File.read(golden, encoding: 'UTF-8')))
      end
    end
  end
end
