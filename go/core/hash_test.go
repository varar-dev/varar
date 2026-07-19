package varcore

import "testing"

// Port of the FNV-1a vectors from hash.test.ts / DriftTest.java.
func TestHashMatchesTypeScriptVectors(t *testing.T) {
	cases := []struct{ in, want string }{
		{"hello", "fnv1a:4f9f2cab"},
		{"abc", "fnv1a:1a47e90b"},
		{"# Title\n", "fnv1a:4eace75e"},
	}
	for _, c := range cases {
		if got := HashSource(c.in); got != c.want {
			t.Errorf("HashSource(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}
