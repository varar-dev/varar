package varcore

import (
	"regexp"
	"sort"
)

// Matches a sentence against a registry's compiled expressions — port of
// matcher.ts / matcher.rs. Unanchored substring scan per step, then greedy
// left-to-right non-overlap resolution. All returned offsets are UTF-16 (regex
// byte offsets converted at Hit construction).

// paramSpan is the UTF-16 start/end of one captured parameter within the sentence.
type paramSpan struct {
	start int
	end   int
}

// hit is one successful expression match inside a sentence. formats aligns 1:1
// with args (nil where the parameter type has no formatter).
type hit struct {
	expression string
	stepDef    *StepRegistration
	matchStart int
	matchEnd   int
	args       []Value
	paramSpans []paramSpan
	formats    []FormatFn
}

// ambiguityCollision holds two or more hits that start at the same position
// with equal length.
type ambiguityCollision struct {
	matchStart int
	matchEnd   int
	candidates []hit
}

// resolvedSteps is the tagged result of resolveHits: when ambiguous is true,
// collisions holds every same-start/same-length tie; otherwise steps holds the
// greedy, left-to-right, non-overlapping selection.
type resolvedSteps struct {
	ambiguous  bool
	steps      []hit
	collisions []ambiguityCollision
}

// findHits returns every expression match found anywhere in sentence, one
// unanchored scan per registered step, in registration order. Regex byte
// offsets are converted to UTF-16 at Hit construction.
func findHits(sentence string, registry Registry) []hit {
	var hits []hit
	for _, step := range registry.Steps {
		unanchored, err := regexp.Compile(stripAnchors(step.compiled.regexpSource))
		if err != nil {
			continue
		}
		for _, loc := range unanchored.FindAllStringIndex(sentence, -1) {
			mStart, mEnd := loc[0], loc[1]
			matchedText := sentence[mStart:mEnd]
			arguments := step.compiled.matchWhole(matchedText)

			args := make([]Value, 0, len(arguments))
			var spans []paramSpan
			formats := make([]FormatFn, 0, len(arguments))
			for _, arg := range arguments {
				formats = append(formats, registry.Formats[arg.parameterTypeName])
				if arg.hasGroup {
					spans = append(spans, paramSpan{
						start: utf16Index(sentence, mStart+arg.groupStart),
						end:   utf16Index(sentence, mStart+arg.groupEnd),
					})
				}
				args = append(args, arg.value)
			}

			hits = append(hits, hit{
				expression: step.Expression,
				stepDef:    step,
				matchStart: utf16Index(sentence, mStart),
				matchEnd:   utf16Index(sentence, mEnd),
				args:       args,
				paramSpans: spans,
				formats:    formats,
			})
		}
	}
	return hits
}

// resolveHits selects the greedy, left-to-right, non-overlapping subset of hits,
// or reports every same-start/same-length ambiguity. Port of resolveHits.
func resolveHits(hits []hit) resolvedSteps {
	if len(hits) == 0 {
		return resolvedSteps{steps: nil}
	}
	sorted := make([]hit, len(hits))
	copy(sorted, hits)
	// Sort by matchStart ascending, then by length descending (stable).
	sort.SliceStable(sorted, func(i, j int) bool {
		if sorted[i].matchStart != sorted[j].matchStart {
			return sorted[i].matchStart < sorted[j].matchStart
		}
		return (sorted[j].matchEnd - sorted[j].matchStart) < (sorted[i].matchEnd - sorted[i].matchStart)
	})

	var collisions []ambiguityCollision
	i := 0
	for i < len(sorted) {
		hereStart := sorted[i].matchStart
		hereLen := sorted[i].matchEnd - sorted[i].matchStart
		j := i + 1
		for j < len(sorted) &&
			sorted[j].matchStart == hereStart &&
			sorted[j].matchEnd-sorted[j].matchStart == hereLen {
			j++
		}
		if j-i > 1 {
			cands := make([]hit, j-i)
			copy(cands, sorted[i:j])
			collisions = append(collisions, ambiguityCollision{
				matchStart: hereStart,
				matchEnd:   sorted[i].matchEnd,
				candidates: cands,
			})
		}
		i = j
	}
	if len(collisions) > 0 {
		return resolvedSteps{ambiguous: true, collisions: collisions}
	}

	var steps []hit
	cursor := -1
	for _, h := range sorted {
		if h.matchStart < cursor {
			continue
		}
		cursor = h.matchEnd
		steps = append(steps, h)
	}
	return resolvedSteps{steps: steps}
}
