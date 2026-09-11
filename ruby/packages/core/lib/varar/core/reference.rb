# frozen_string_literal: true

require 'varar/core/ast'

module Varar
  module Core
    # Reuse is a link (ADR 0016). A candidate block whose entire content is a
    # single Markdown link to an oath section is a REFERENCE BLOCK: it splices
    # that section's steps in at its own position instead of being prose.
    #
    # Everything here is pure text and path arithmetic — no filesystem. The
    # shell reads the documents; `references` tells it which ones to read, and
    # `build_workspace` turns the collection into what `plan` needs.
    module Reference
      # The referenced oath's path (resolved against the referring doc's own
      # path), the GFM slug of the heading, and the link's visible text.
      Ref = Data.define(:path, :slug, :text)

      # What `plan` needs to resolve references: every oath by path, plus which
      # sections a reference block consumes somewhere in the project. A section
      # that is referenced stops being a standalone example, so this is
      # whole-project knowledge — see ADR 0016 on why each runner builds it at
      # its once-per-run discovery pass.
      Workspace = Data.define(:docs, :referenced)

      # A candidate is a reference block iff its whole text is one Markdown link
      # whose target is oath-shaped. Anything else — a link with surrounding
      # words, a link to https://…, to a .rb file, to a mailto: — is ordinary
      # content, so existing documents keep their meaning.
      LINK_ONLY = /\A\[([^\]]*)\]\(\s*([^\s)]+)\s*\)\z/
      PROTOCOL = /\A[a-z][a-z0-9+.-]*:/i

      module_function

      def reference_of(text, from_path)
        m = LINK_ONLY.match(text.strip)
        return nil if m.nil?

        link_text = m[1]
        target = m[2]
        return Ref.new(path: from_path, slug: normalize_slug(target[1..]), text: link_text) if target.start_with?('#')

        hash_at = target.index('#')
        file_part = hash_at.nil? ? target : target[0...hash_at]
        fragment = hash_at.nil? ? '' : target[(hash_at + 1)..]
        # Only a relative Markdown path is a reference. A protocol (https:,
        # mailto:) or any other extension is left alone — remote references are
        # deliberately out of scope (ADR 0016).
        return nil unless file_part.end_with?('.md')
        return nil if PROTOCOL.match?(file_part) || file_part.start_with?('/')

        Ref.new(path: join_posix(dirname_posix(from_path), file_part), slug: normalize_slug(fragment),
                text: link_text)
      end

      # GitHub's heading anchors: inline markup dropped, lowercased, spaces to
      # hyphens, everything else that isn't a word character or hyphen removed.
      # The same function produces the slug of a heading and normalizes the slug
      # written in a link, so the two meet in the middle.
      def slugify(heading_text)
        stripped = heading_text.gsub(/`([^`]*)`/, '\1')
                               .gsub(/\*\*([^*]*)\*\*/, '\1')
                               .gsub(/\*([^*]*)\*/, '\1')
                               .gsub(/_([^_]*)_/, '\1')
        normalize_slug(stripped)
      end

      # One hyphen per space, not per run of them: GitHub leaves the gap where
      # it dropped punctuation, so "Fees, VAT & rounding" slugs with a double
      # hyphen.
      def normalize_slug(str)
        str.strip.downcase.gsub(/[^[[:word:]] -]/, '').tr(' ', '-')
      end

      def dirname_posix(path)
        i = path.rindex('/')
        i.nil? ? '' : path[0...i]
      end

      # POSIX path arithmetic on oath paths (always '/'-separated, relative to
      # the workspace root). The core may not touch the filesystem.
      def join_posix(dir, rel)
        segments = dir.empty? ? [] : dir.split('/')
        rel.split('/').each do |segment|
          next if segment.empty? || segment == '.'

          segment == '..' ? segments.pop : segments << segment
        end
        segments.join('/')
      end

      # Every reference block in a document, in document order. The shell uses
      # this to walk the closure of documents it must read before planning.
      def references(doc)
        doc.examples.filter_map do |ex|
          primary = ex.body.first
          next nil unless primary.respond_to?(:text)

          reference_of(primary.text, doc.path)
        end
      end

      def section_key(path, slug)
        "#{path}##{slug}"
      end

      # The workspace with no references at all: what a caller planning a single
      # document in isolation passes.
      def empty_workspace
        Workspace.new(docs: {}, referenced: Set.new)
      end

      def build_workspace(docs)
        by_path = docs.to_h { |doc| [doc.path, doc] }
        referenced = Set.new
        docs.each do |doc|
          references(doc).each { |ref| referenced << section_key(ref.path, ref.slug) }
        end
        Workspace.new(docs: by_path, referenced: referenced)
      end

      # The candidates that make up a section: those whose heading chain
      # contains the slug. A whole-file reference ('' slug) is every candidate.
      # Section membership follows the document outline exactly — a heading's
      # section runs until the next heading of the same or higher level, which
      # is precisely the range over which it stays on the scope stack.
      def section_candidates(doc, slug)
        return doc.examples if slug.empty?

        doc.examples.select { |ex| ex.scope_stack.any? { |h| slugify(h) == slug } }
      end
    end
  end
end
