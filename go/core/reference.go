package core

import (
	"regexp"
	"sort"
	"strings"
)

// Reuse is a link (ADR 0016). A candidate block whose entire content is a single
// Markdown link to an oath section is a REFERENCE BLOCK: it splices that
// section's steps in at its own position instead of being prose.
//
// Everything here is pure text and path arithmetic — no filesystem. The shell
// reads the documents; References tells it which ones to read, and
// BuildWorkspace turns the collection into what Plan needs.

// Reference is one resolved reference block: the referenced oath's path
// (resolved against the referring doc's own path), the GFM slug of the heading
// (empty for a whole-file link), and the link's visible text.
type Reference struct {
	Path string
	Slug string
	Text string
}

// OathWorkspace is what Plan needs to resolve references: every oath by path,
// plus which sections a reference block consumes somewhere in the project. A
// section that is referenced stops being a standalone example, so this is
// whole-project knowledge — see ADR 0016 on why each runner builds it at its
// once-per-run discovery pass.
type OathWorkspace struct {
	Docs       map[string]Doc
	Referenced map[string]bool
}

// A candidate is a reference block iff its whole text is one Markdown link whose
// target is oath-shaped. Anything else — a link with surrounding words, a link
// to https://…, to a .go file, to a mailto: — is ordinary content, so existing
// documents keep their meaning.
var (
	linkOnlyRE = regexp.MustCompile(`^\[([^\]]*)\]\(\s*([^\s)]+)\s*\)$`)
	protocolRE = regexp.MustCompile(`^[a-zA-Z][a-zA-Z0-9+.\-]*:`)
	notSlugRE  = regexp.MustCompile(`[^\p{L}\p{N} _-]`)
	codeSpanRE = regexp.MustCompile("`([^`]*)`")
	strongRE   = regexp.MustCompile(`\*\*([^*]*)\*\*`)
	emphRE     = regexp.MustCompile(`\*([^*]*)\*`)
	underRE    = regexp.MustCompile(`_([^_]*)_`)
)

// ReferenceOf returns the reference a block's text spells, or nil when the text
// is ordinary content.
func ReferenceOf(text string, fromPath string) *Reference {
	m := linkOnlyRE.FindStringSubmatch(strings.TrimSpace(text))
	if m == nil {
		return nil
	}
	linkText, target := m[1], m[2]
	if strings.HasPrefix(target, "#") {
		return &Reference{Path: fromPath, Slug: normalizeSlug(target[1:]), Text: linkText}
	}
	filePart, fragment := target, ""
	if i := strings.Index(target, "#"); i != -1 {
		filePart, fragment = target[:i], target[i+1:]
	}
	// Only a relative Markdown path is a reference. A protocol (https:, mailto:)
	// or any other extension is left alone — remote references are deliberately
	// out of scope (ADR 0016).
	if !strings.HasSuffix(filePart, ".md") || protocolRE.MatchString(filePart) {
		return nil
	}
	if strings.HasPrefix(filePart, "/") {
		return nil
	}
	return &Reference{
		Path: JoinPosix(dirnamePosix(fromPath), filePart),
		Slug: normalizeSlug(fragment),
		Text: linkText,
	}
}

// Slugify mirrors GitHub's heading anchors: inline markup dropped, lowercased,
// spaces to hyphens, everything else that isn't a word character or hyphen
// removed. The same function produces the slug of a heading and normalizes the
// slug written in a link, so the two meet in the middle.
func Slugify(headingText string) string {
	s := codeSpanRE.ReplaceAllString(headingText, "$1")
	s = strongRE.ReplaceAllString(s, "$1")
	s = emphRE.ReplaceAllString(s, "$1")
	s = underRE.ReplaceAllString(s, "$1")
	return normalizeSlug(s)
}

func normalizeSlug(s string) string {
	// One hyphen per space, not per run of them: GitHub leaves the gap where it
	// dropped punctuation, so "Fees, VAT & rounding" slugs with a double hyphen.
	return strings.ReplaceAll(notSlugRE.ReplaceAllString(strings.ToLower(strings.TrimSpace(s)), ""), " ", "-")
}

func dirnamePosix(path string) string {
	i := strings.LastIndex(path, "/")
	if i == -1 {
		return ""
	}
	return path[:i]
}

// JoinPosix is POSIX path arithmetic on oath paths (always '/'-separated,
// relative to the workspace root). The core may not touch the filesystem.
func JoinPosix(dir, rel string) string {
	var segments []string
	if dir != "" {
		segments = strings.Split(dir, "/")
	}
	for _, segment := range strings.Split(rel, "/") {
		switch segment {
		case "", ".":
			continue
		case "..":
			// Climbing above the workspace root keeps the leading "../": the
			// oath-path convention spells an oath outside the root that way,
			// so the resolver must produce the same spelling.
			if len(segments) > 0 && segments[len(segments)-1] != ".." {
				segments = segments[:len(segments)-1]
			} else {
				segments = append(segments, "..")
			}
		default:
			segments = append(segments, segment)
		}
	}
	return strings.Join(segments, "/")
}

// References returns every reference block in a document, in document order.
// The shell uses it to walk the closure of documents it must read before
// planning.
func References(doc Doc) []Reference {
	var out []Reference
	for _, ex := range doc.Examples {
		if len(ex.Body) == 0 {
			continue
		}
		block := ex.Body[0]
		if !isTextBearing(block) {
			continue
		}
		text := textOf(block)
		if ref := ReferenceOf(text, doc.Path); ref != nil {
			out = append(out, *ref)
		}
	}
	return out
}

// SectionKey is a section's identity across the project.
func SectionKey(path, slug string) string {
	return path + "#" + slug
}

// EmptyWorkspace is the workspace with no references at all: what a caller
// planning a single document in isolation passes.
func EmptyWorkspace() OathWorkspace {
	return OathWorkspace{Docs: map[string]Doc{}, Referenced: map[string]bool{}}
}

// BuildWorkspace indexes every oath by path and records every consumed section.
func BuildWorkspace(docs []Doc) OathWorkspace {
	ws := OathWorkspace{Docs: make(map[string]Doc, len(docs)), Referenced: map[string]bool{}}
	for _, doc := range docs {
		ws.Docs[doc.Path] = doc
	}
	for _, doc := range docs {
		for _, ref := range References(doc) {
			ws.Referenced[SectionKey(ref.Path, ref.Slug)] = true
		}
	}
	return ws
}

// ReferencedKeys returns the consumed-section keys, sorted — a stable view for
// adapters that hand the set on.
func ReferencedKeys(ws OathWorkspace) []string {
	keys := make([]string, 0, len(ws.Referenced))
	for key := range ws.Referenced {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

// SectionCandidates returns the candidates that make up a section: those whose
// heading chain contains the slug. A whole-file reference (empty slug) is every
// candidate in the document. Section membership follows the document outline
// exactly — a heading's section runs until the next heading of the same or
// higher level, which is precisely the range over which it stays on the scope
// stack.
func SectionCandidates(doc Doc, slug string) []Example {
	if slug == "" {
		return doc.Examples
	}
	var out []Example
	for _, ex := range doc.Examples {
		for _, h := range ex.ScopeStack {
			if Slugify(h) == slug {
				out = append(out, ex)
				break
			}
		}
	}
	return out
}
