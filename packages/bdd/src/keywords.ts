import { KEYWORDS } from './keywords-data.js'

const PREFIXES: ReadonlyArray<string> = [...KEYWORDS]
  .filter((kw) => kw.length > 1)
  .sort((a, b) => b.length - a.length)

export function isKeywordLed(sentence: string): boolean {
  const trimmed = sentence.trimStart()
  for (const kw of PREFIXES) {
    if (startsWithKeyword(trimmed, kw)) return true
  }
  return false
}

export function stripLeadingKeyword(sentence: string): string {
  const trimmed = sentence.trimStart()
  for (const kw of PREFIXES) {
    if (startsWithKeyword(trimmed, kw)) {
      const rest = trimmed.slice(kw.length).replace(/^\s+/, '')
      return rest
    }
  }
  return sentence
}

function startsWithKeyword(sentence: string, kw: string): boolean {
  if (!sentence.toLowerCase().startsWith(kw.toLowerCase())) return false
  const next = sentence.charAt(kw.length)
  if (next === '') return true
  // Keyword must be followed by whitespace or punctuation, not another letter.
  return /\s|[,;:]/.test(next)
}
