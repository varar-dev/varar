# frozen_string_literal: true

require 'fileutils'
require 'json'
require 'varar/core'

module Varar
  module Runner
    # Persists run results for the language server (ADR 0014) — the shell half of
    # the contract the core builds the payload for. Writes
    # `<root>/.varar/<oath_path>.json`, which the (language-neutral) LSP reads to
    # turn a failure into an editor diagnostic.
    #
    # Lives in the runner so both adapters — RSpec and Minitest — feed the same
    # collector and cannot drift from each other, or from the TypeScript
    # reporter this is a port of.
    class Results
      def initialize
        @sources = {}
        @examples = {}
      end

      # `<root>/.varar/<oath_path>.json` — the file the LSP watches.
      def self.result_file_path(root, oath_path)
        File.join(root, '.varar', "#{oath_path}.json")
      end

      # Writes one oath's results: 2-space indent plus a trailing newline,
      # matching `JSON.stringify(results, null, 2)` in the TypeScript port.
      def self.write(root, results)
        out = result_file_path(root, results.oath_path)
        FileUtils.mkdir_p(File.dirname(out))
        File.write(out, "#{JSON.pretty_generate(Core::Results.to_wire(results))}\n", encoding: 'UTF-8')
        out
      end

      # Accumulates one example's outcome; the oath's file is written once its
      # examples are in.
      def record(oath_path, source, result)
        @sources[oath_path] = source
        (@examples[oath_path] ||= []) << result
      end

      # Writes what has been recorded for `oath_path` and forgets it. Passing
      # oaths are written too — a stale file would keep a diagnostic on screen
      # that the run has just cleared.
      def flush(root, oath_path)
        recorded = @examples.delete(oath_path)
        return nil if recorded.nil? || recorded.empty?

        self.class.write(root, Core::OathResults.new(
                                 version: 1,
                                 oath_path: oath_path,
                                 source_hash: Core::Hash32.hash_source(@sources[oath_path]),
                                 examples: recorded
                               ))
      end

      # Writes every oath still held — for a runner with no per-file completion hook.
      def flush_all(root)
        @examples.keys.to_a.each { |oath_path| flush(root, oath_path) }
      end
    end
  end
end
