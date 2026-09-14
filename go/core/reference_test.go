package core

import "testing"

// A relative link that climbs above the workspace root keeps its leading
// "../" — the oath-path convention spells an oath outside the root that way.
func TestReferenceAboveWorkspaceRootKeepsLeadingDotDot(t *testing.T) {
	cases := []struct {
		from, text, wantPath, wantSlug string
	}{
		{"varar/a.md", "[Up](../../shared/b.md#setup)", "../shared/b.md", "setup"},
		{"../outside/a.md", "[Up](../b.md)", "../b.md", ""},
		{"varar/a.md", "[Sibling](./b.md#setup)", "varar/b.md", "setup"},
	}
	for _, c := range cases {
		ref := ReferenceOf(c.text, c.from)
		if ref == nil {
			t.Fatalf("%q from %q: expected a reference, got nil", c.text, c.from)
		}
		if ref.Path != c.wantPath || ref.Slug != c.wantSlug {
			t.Errorf("%q from %q: got path %q slug %q, want path %q slug %q",
				c.text, c.from, ref.Path, ref.Slug, c.wantPath, c.wantSlug)
		}
	}
}

func TestJoinPosixKeepsUnpoppableDotDot(t *testing.T) {
	cases := []struct{ dir, rel, want string }{
		{"varar", "../../shared/b.md", "../shared/b.md"},
		{"../outside", "../b.md", "../b.md"},
		{"", "../b.md", "../b.md"},
		{"a/b", "../c.md", "a/c.md"},
		{"a", "./b.md", "a/b.md"},
	}
	for _, c := range cases {
		if got := JoinPosix(c.dir, c.rel); got != c.want {
			t.Errorf("JoinPosix(%q, %q) = %q, want %q", c.dir, c.rel, got, c.want)
		}
	}
}
