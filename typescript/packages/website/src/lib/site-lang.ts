// The site-wide language choice: which port's code the examples show. One
// value for the whole site, chosen in the header dropdown, persisted in
// localStorage and mirrored to `data-lang` on <html> (attribute-less means
// the TypeScript default, matching the other header selects). Everything
// that shows code — the interactive editors, Starlight's synced code tabs —
// follows it via the change event.
//
// The set of supported languages, their labels, icons, file extensions and
// install/scaffold/run commands all come from the repo-root `languages.json`
// — the single source of truth shared with the docs (install tabs), the
// pre-paint restore script in astro.config.mjs, and the per-port scaffolders.
// Add a language there (and to the SiteLang union below) and every consumer
// picks it up.

import languagesData from '../../../../../languages.json'

export type SiteLang = 'ts' | 'java' | 'kotlin' | 'python' | 'ruby'

/** A block of shell / build-file text plus the fence language it renders as. */
export type CommandBlock = {
  readonly lang: string
  readonly code: string
}

/** One entry in `languages.json`. */
export type Language = {
  readonly id: SiteLang
  readonly label: string
  /** Seti file-type icon name bundled with Starlight (e.g. `seti:ruby`). */
  readonly icon: string
  /** Step-definition file extension, including the dot (e.g. `.rb`). */
  readonly ext: string
  /** Glob a scaffolded project uses to discover this language's steps. */
  readonly stepsGlob: string
  /** Whether the port ships a `var` CLI (TS/Python/Ruby) or is copy-paste (JVM). */
  readonly hasCli: boolean
  readonly install: CommandBlock
  /** The scaffold command, or null for ports without a CLI. */
  readonly scaffold: CommandBlock | null
  readonly run: CommandBlock
}

// `languages.json` is data, so its inferred type widens `id` to `string`; the
// cast pins it to the SiteLang union. Keep the union above in step with the
// ids in the manifest — those are the only two places the language set lives.
export const LANGUAGES: ReadonlyArray<Language> = languagesData as ReadonlyArray<Language>

export const SITE_LANGS: ReadonlyArray<SiteLang> = LANGUAGES.map((l) => l.id)

// Starlight <TabItem> labels ↔ SiteLang. The labels double as the values
// Starlight persists for `syncKey="lang"` tab groups, so they must match the
// TabItem labels used in docs pages exactly.
export const LANG_LABELS: Readonly<Record<SiteLang, string>> = Object.fromEntries(
  LANGUAGES.map((l) => [l.id, l.label]),
) as Record<SiteLang, string>

// Seti file-type icons bundled with Starlight — the header dropdown shows the
// selected language's logo.
export const LANG_ICONS: Readonly<Record<SiteLang, string>> = Object.fromEntries(
  LANGUAGES.map((l) => [l.id, l.icon]),
) as Record<SiteLang, string>

// Step-file extension → language, for the interactive editor tabs.
const LANG_BY_EXT: ReadonlyMap<string, SiteLang> = new Map(LANGUAGES.map((l) => [l.ext, l.id]))

export const LANG_CHANGE_EVENT = 'var-lang-change'

const storageKey = 'var-lang'

// Every language except the attribute-less TypeScript default.
const NON_DEFAULT_LANGS: ReadonlyArray<SiteLang> = SITE_LANGS.filter((l) => l !== 'ts')

export const parseLang = (value: unknown): SiteLang =>
  NON_DEFAULT_LANGS.includes(value as SiteLang) ? (value as SiteLang) : 'ts'

export const langOfLabel = (label: string): SiteLang | undefined =>
  SITE_LANGS.find((lang) => LANG_LABELS[lang] === label)

// Maps a code file extension to its language; undefined for language-neutral
// files (the .md spec) that are shown regardless of the site language.
export function langOfPath(path: string): SiteLang | undefined {
  for (const [ext, lang] of LANG_BY_EXT) {
    if (path.endsWith(ext)) return lang
  }
  return undefined
}

export const currentLang = (): SiteLang => parseLang(document.documentElement.dataset.lang)

/** Apply + persist a language choice and notify listeners (editors, tab sync). */
export function setLang(lang: SiteLang): void {
  if (currentLang() === lang) return
  document.documentElement.dataset.lang = lang
  try {
    localStorage.setItem(storageKey, lang)
  } catch {
    // private mode — the choice just won't persist
  }
  document.dispatchEvent(new CustomEvent<SiteLang>(LANG_CHANGE_EVENT, { detail: lang }))
}

export function onLangChange(listener: (lang: SiteLang) => void): void {
  document.addEventListener(LANG_CHANGE_EVENT, (e) => {
    listener(parseLang((e as CustomEvent<SiteLang>).detail))
  })
}
