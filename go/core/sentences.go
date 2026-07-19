package varcore

// Splits a block of text into sentence-level spans so the matcher can try each
// sentence independently — port of sentences.ts / sentences.rs. Operates on
// runes with a running UTF-16 offset table; emitted offsets are UTF-16.

// sentence is a sentence: the trimmed text plus its UTF-16 offsets into the input.
type sentence struct {
	text        string
	startOffset int
	endOffset   int
}

var abbreviations = []string{"e.g.", "i.e.", "etc.", "cf.", "vs."}

// splitSentences splits text on ./!/?/newline terminators, skipping backtick
// code-span and double-quoted interiors, and treating decimals and a fixed
// abbreviation list as non-terminating dots.
func splitSentences(text string) []sentence {
	chars := []rune(text)
	n := len(chars)

	// Prefix table: cpToU16[i] = UTF-16 offset of char i; cpToU16[n] = total.
	cpToU16 := make([]int, n+1)
	for i := 0; i < n; i++ {
		cpToU16[i+1] = cpToU16[i] + utf16RuneLen(chars[i])
	}

	// Mark backtick code spans and double-quoted strings as no-split zones.
	skip := make([]bool, n)
	j := 0
	for j < n {
		c := chars[j]
		if c == '`' || c == '"' {
			close := findChar(chars, j+1, c)
			if close < 0 {
				break
			}
			for k := j; k <= close; k++ {
				skip[k] = true
			}
			j = close
		}
		j++
	}

	var out []sentence
	segmentStart := 0
	i := 0
	for i < n {
		if skip[i] {
			i++
			continue
		}
		ch := chars[i]
		if ch == '\n' || ch == '.' || ch == '!' || ch == '?' {
			if ch == '.' && isInsideNumberOrAbbrev(chars, i) {
				i++
				continue
			}
			end := i + 1
			out = pushSegment(out, chars, cpToU16, segmentStart, end)
			i = end
			// Skip following whitespace so the next sentence starts at content.
			for i < n && (chars[i] == ' ' || chars[i] == '\n') {
				i++
			}
			segmentStart = i
			continue
		}
		i++
	}
	out = pushSegment(out, chars, cpToU16, segmentStart, n)
	return out
}

func findChar(chars []rune, from int, target rune) int {
	for k := from; k < len(chars); k++ {
		if chars[k] == target {
			return k
		}
	}
	return -1
}

func pushSegment(out []sentence, chars []rune, cpToU16 []int, start, end int) []sentence {
	if end <= start {
		return out
	}
	raw := string(chars[start:end])
	slice := javaStrip(raw)
	if slice == "" {
		return out
	}
	leading := utf16Len(raw) - utf16Len(javaStripLeading(raw))
	trimmedStart := cpToU16[start] + leading
	trimmedEnd := trimmedStart + utf16Len(slice)
	return append(out, sentence{
		text:        slice,
		startOffset: trimmedStart,
		endOffset:   trimmedEnd,
	})
}

func isInsideNumberOrAbbrev(chars []rune, dotPos int) bool {
	var prev, next rune
	if dotPos > 0 {
		prev = chars[dotPos-1]
	}
	if dotPos+1 < len(chars) {
		next = chars[dotPos+1]
	}
	if isASCIIDigit(prev) && isASCIIDigit(next) {
		return true
	}
	// Known abbreviations ending at dotPos+1.
	for _, abbrev := range abbreviations {
		length := len([]rune(abbrev))
		from := dotPos + 1 - length
		if from < 0 {
			from = 0
		}
		candidate := string(chars[from : dotPos+1])
		if candidate == abbrev {
			return true
		}
	}
	// Lowercase letter following → likely intra-word.
	return next >= 'a' && next <= 'z'
}

func isASCIIDigit(r rune) bool { return r >= '0' && r <= '9' }
