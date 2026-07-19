package core

import (
	"fmt"
	"unicode/utf16"
)

// FNV-1a (32-bit) change-detector over UTF-16 code units — port of hash.ts /
// hash.rs. Byte-identical across every port so varar.lock.json fingerprints
// match. The fnv1a: prefix namespaces the algorithm.

const (
	fnvOffset uint32 = 0x811c9dc5
	fnvPrime  uint32 = 0x01000193
)

// HashSource hashes source to fnv1a:<8 hex> (FNV-1a over UTF-16 code units,
// wrapping).
func HashSource(source string) string {
	h := fnvOffset
	for _, unit := range utf16.Encode([]rune(source)) {
		h = (h ^ uint32(unit)) * fnvPrime
	}
	return fmt.Sprintf("fnv1a:%08x", h)
}
