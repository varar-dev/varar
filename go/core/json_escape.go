package core

import (
	"strconv"
	"strings"
)

// JSON string escaping, reproducing JSON.stringify's: control chars as \uXXXX,
// non-ASCII raw. Shared by the two writers that produce real files —
// StringifyLockFile (varar.lock.json, committed and language-shared) and the
// run-result writer in the runner.
//
// Conformance goldens do NOT go through a writer any more: a port must agree
// with what the goldens SAY, so each test parses them (ParseJSONValue) and
// compares deep equality.

func writeString(b *strings.Builder, s string) {
	b.WriteByte('"')
	for _, c := range s {
		switch c {
		case '"':
			b.WriteString("\\\"")
		case '\\':
			b.WriteString("\\\\")
		case '\n':
			b.WriteString("\\n")
		case '\r':
			b.WriteString("\\r")
		case '\t':
			b.WriteString("\\t")
		case '\b':
			b.WriteString("\\b")
		case '\f':
			b.WriteString("\\f")
		default:
			if c < 0x20 {
				b.WriteString("\\u")
				hex := strconv.FormatInt(int64(c), 16)
				for k := len(hex); k < 4; k++ {
					b.WriteByte('0')
				}
				b.WriteString(hex)
			} else {
				// Non-ASCII (and all other) characters are emitted raw.
				b.WriteRune(c)
			}
		}
	}
	b.WriteByte('"')
}
