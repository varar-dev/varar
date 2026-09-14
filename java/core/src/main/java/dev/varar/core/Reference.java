package dev.varar.core;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reuse is a link (ADR 0016). A candidate block whose entire content is a single Markdown link to an
 * oath section is a REFERENCE BLOCK: it splices that section's steps in at its own position instead
 * of being prose.
 *
 * <p>Everything here is pure text and path arithmetic — no filesystem. The shell reads the
 * documents; {@link #references} tells it which ones to read, and {@link #buildWorkspace} turns the
 * collection into what {@link Plan#plan} needs.
 */
public final class Reference {

    private Reference() {}

    /**
     * One resolved reference block: the referenced oath's path (resolved against the referring doc's
     * own path), the GFM slug of the heading (empty for a whole-file link), and the link's text.
     */
    public record Ref(String path, String slug, String text) {}

    /**
     * What {@link Plan#plan} needs to resolve references: every oath by path, plus which sections a
     * reference block consumes somewhere in the project. A section that is referenced stops being a
     * standalone example, so this is whole-project knowledge — see ADR 0016 on why each runner
     * builds it at its once-per-run discovery pass.
     */
    public record OathWorkspace(Map<String, Ast.Doc> docs, Set<String> referenced) {
        public OathWorkspace {
            docs = Map.copyOf(docs);
            referenced = Set.copyOf(referenced);
        }
    }

    // A candidate is a reference block iff its whole text is one Markdown link whose target is
    // oath-shaped. Anything else — a link with surrounding words, a link to https://…, to a .java
    // file, to a mailto: — is ordinary content, so existing documents keep their meaning.
    private static final Pattern LINK_ONLY = Pattern.compile("^\\[([^\\]]*)\\]\\(\\s*([^\\s)]+)\\s*\\)$");
    private static final Pattern PROTOCOL = Pattern.compile("^[a-zA-Z][a-zA-Z0-9+.\\-]*:");
    private static final Pattern NOT_SLUG = Pattern.compile("[^\\p{L}\\p{N} _-]");
    private static final Pattern CODE_SPAN = Pattern.compile("`([^`]*)`");
    private static final Pattern STRONG = Pattern.compile("\\*\\*([^*]*)\\*\\*");
    private static final Pattern EMPH = Pattern.compile("\\*([^*]*)\\*");
    private static final Pattern UNDER = Pattern.compile("_([^_]*)_");

    /** The reference a block's text spells, or {@code null} when it is ordinary content. */
    public static Ref referenceOf(String text, String fromPath) {
        Matcher m = LINK_ONLY.matcher(text.trim());
        if (!m.matches()) return null;
        String linkText = m.group(1);
        String target = m.group(2);
        if (target.startsWith("#")) {
            return new Ref(fromPath, normalizeSlug(target.substring(1)), linkText);
        }
        int hash = target.indexOf('#');
        String filePart = hash == -1 ? target : target.substring(0, hash);
        String fragment = hash == -1 ? "" : target.substring(hash + 1);
        // Only a relative Markdown path is a reference. A protocol (https:, mailto:) or any other
        // extension is left alone — remote references are deliberately out of scope (ADR 0016).
        if (!filePart.endsWith(".md") || PROTOCOL.matcher(filePart).find() || filePart.startsWith("/")) {
            return null;
        }
        return new Ref(joinPosix(dirnamePosix(fromPath), filePart), normalizeSlug(fragment), linkText);
    }

    /**
     * GitHub's heading anchors: inline markup dropped, lowercased, spaces to hyphens, everything
     * else that isn't a word character or hyphen removed. The same function produces the slug of a
     * heading and normalizes the slug written in a link, so the two meet in the middle.
     */
    public static String slugify(String headingText) {
        String s = CODE_SPAN.matcher(headingText).replaceAll("$1");
        s = STRONG.matcher(s).replaceAll("$1");
        s = EMPH.matcher(s).replaceAll("$1");
        s = UNDER.matcher(s).replaceAll("$1");
        return normalizeSlug(s);
    }

    private static String normalizeSlug(String s) {
        // One hyphen per space, not per run of them: GitHub leaves the gap where it dropped
        // punctuation, so "Fees, VAT & rounding" slugs with a double hyphen.
        return NOT_SLUG.matcher(s.trim().toLowerCase(java.util.Locale.ROOT))
                .replaceAll("")
                .replace(' ', '-');
    }

    private static String dirnamePosix(String path) {
        int i = path.lastIndexOf('/');
        return i == -1 ? "" : path.substring(0, i);
    }

    /**
     * POSIX path arithmetic on oath paths (always '/'-separated, relative to the workspace root).
     * The core may not touch the filesystem.
     */
    public static String joinPosix(String dir, String rel) {
        List<String> segments = new ArrayList<>();
        if (!dir.isEmpty()) {
            for (String s : dir.split("/")) segments.add(s);
        }
        for (String segment : rel.split("/")) {
            if (segment.isEmpty() || segment.equals(".")) continue;
            if (!segment.equals("..")) {
                segments.add(segment);
            } else if (!segments.isEmpty() && !segments.get(segments.size() - 1).equals("..")) {
                segments.remove(segments.size() - 1);
            } else {
                // A `..` with nothing left to climb out of stays: an oath above the workspace root
                // is addressed as `../shared/b.md` (the oath-path convention keeps the leading
                // `../` too), and clamping it would point at the wrong file.
                segments.add("..");
            }
        }
        return String.join("/", segments);
    }

    /**
     * Every reference block in a document, in document order. The shell uses this to walk the
     * closure of documents it must read before planning.
     */
    public static List<Ref> references(Ast.Doc doc) {
        List<Ref> out = new ArrayList<>();
        for (Ast.Example ex : doc.examples()) {
            if (ex.body().isEmpty()) continue;
            String text = textOf(ex.body().get(0));
            if (text == null) continue;
            Ref ref = referenceOf(text, doc.path());
            if (ref != null) out.add(ref);
        }
        return out;
    }

    /** The text of a text-bearing block, or {@code null} for a table or fence. */
    public static String textOf(Ast.Block block) {
        return switch (block) {
            case Ast.Paragraph p -> p.text();
            case Ast.ListItem l -> l.text();
            case Ast.Blockquote b -> b.text();
            default -> null;
        };
    }

    /** A section's identity across the project. */
    public static String sectionKey(String path, String slug) {
        return path + "#" + slug;
    }

    /**
     * The workspace with no references at all: what a caller planning a single document in isolation
     * passes.
     */
    public static OathWorkspace emptyWorkspace() {
        return new OathWorkspace(Map.of(), Set.of());
    }

    /** Indexes every oath by path and records every consumed section. */
    public static OathWorkspace buildWorkspace(List<Ast.Doc> docs) {
        Map<String, Ast.Doc> byPath = new HashMap<>();
        for (Ast.Doc doc : docs) byPath.put(doc.path(), doc);
        Set<String> referenced = new LinkedHashSet<>();
        for (Ast.Doc doc : docs) {
            for (Ref r : references(doc)) referenced.add(sectionKey(r.path(), r.slug()));
        }
        return new OathWorkspace(byPath, new HashSet<>(referenced));
    }

    /**
     * The candidates that make up a section: those whose heading chain contains the slug. A
     * whole-file reference (empty slug) is every candidate in the document. Section membership
     * follows the document outline exactly — a heading's section runs until the next heading of the
     * same or higher level, which is precisely the range over which it stays on the scope stack.
     */
    public static List<Ast.Example> sectionCandidates(Ast.Doc doc, String slug) {
        if (slug.isEmpty()) return doc.examples();
        List<Ast.Example> out = new ArrayList<>();
        for (Ast.Example ex : doc.examples()) {
            for (String h : ex.scopeStack()) {
                if (slugify(h).equals(slug)) {
                    out.add(ex);
                    break;
                }
            }
        }
        return out;
    }
}
