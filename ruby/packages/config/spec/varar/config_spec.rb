# frozen_string_literal: true

require 'spec_helper'
require 'tmpdir'
require 'varar/config'

module Varar
  # read_var_config is the filesystem edge over parse_var_config (issue #11).
  # These pin the pure half directly: a caller holding the text — an editor
  # buffer, the LSP, an in-memory fixture — must be able to validate it without
  # inventing a file. The byte-for-byte behaviour of both is gated by the shared
  # corpus in config_conformance_spec.rb.
  ::RSpec.describe Config do
    describe '.parse_var_config' do
      it 'reads every key without touching the filesystem' do
        cfg = described_class.parse_var_config(
          '{"docs": {"include": ["a/**/*.md"], "exclude": ["a/wip/**"]}, ' \
          '"steps": ["spec/**/*.steps.rb"], "snippets": {"ruby": "R"}}',
          '<memory>'
        )

        expect(cfg.docs_include).to eq(['a/**/*.md'])
        expect(cfg.docs_exclude).to eq(['a/wip/**'])
        expect(cfg.steps).to eq(['spec/**/*.steps.rb'])
        expect(cfg.snippets).to eq({ 'ruby' => 'R' })
      end

      it 'labels errors with the given source' do
        expect { described_class.parse_var_config('{oops', 'buffer://untitled') }
          .to raise_error(ArgumentError, %r{buffer://untitled})
      end

      it 'parses an empty object as the empty config' do
        expect(described_class.parse_var_config('{}', '<memory>')).to eq(Config::VarConfig.new)
      end
    end

    describe '.read_var_config' do
      it 'returns the empty config when there is no file' do
        Dir.mktmpdir { |tmp| expect(described_class.read_var_config(tmp)).to eq(Config::VarConfig.new) }
      end

      it 'delegates to parse_var_config, labelling errors with the path' do
        Dir.mktmpdir do |tmp|
          File.write(File.join(tmp, 'varar.config.json'), '{oops')
          expect { described_class.read_var_config(tmp) }
            .to raise_error(ArgumentError, /varar\.config\.json/)
        end
      end
    end
  end
end
