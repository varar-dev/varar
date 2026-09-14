# frozen_string_literal: true

require 'spec_helper'
require 'varar/core'

module Varar
  module Core
    # Reference blocks (ADR 0016): the link target is resolved against the
    # referring oath's own path with plain POSIX arithmetic — no filesystem.
    ::RSpec.describe Reference do
      it 'resolves a relative link against the referring document directory' do
        ref = described_class.reference_of('[Setup](./shared.md#setup)', 'varar/a.md')
        expect(ref.path).to eq('varar/shared.md')
        expect(ref.slug).to eq('setup')
        expect(ref.text).to eq('Setup')
      end

      it 'keeps a leading ../ when the link climbs above the workspace root' do
        ref = described_class.reference_of('[Up](../../shared/b.md#setup)', 'varar/a.md')
        expect(ref.path).to eq('../shared/b.md')
        expect(ref.slug).to eq('setup')
      end

      it 'keeps climbing from an oath that is already outside the root' do
        ref = described_class.reference_of('[Up](../b.md)', '../outside/a.md')
        expect(ref.path).to eq('../b.md')
        expect(ref.slug).to eq('')
      end
    end
  end
end
