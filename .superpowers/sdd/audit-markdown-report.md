# Markdown/CJK/export audit remediation

## Status

Implemented on `cursor/codebase-simplification-5ed7` after the renderer batch.
No Electron code was changed. No push or amend was performed.

## Remediation

- Math live preview now inspects the Markdown AST and rejects the common
  currency-delimiter ambiguity (`Price is $5 and $10`) while retaining inline
  and display KaTeX previews.
- Markdown parsing uses one shared parser for block/context derivation, CJK
  transforms, statistics, and math detection. Full rendering can consume an
  existing document model; the live-math parse-count regression measures two
  parses (document plus active source), and fails at three if rendering parses
  again. Existing boundary/Enter/drag parse-count regressions remain green.
- HTTPS and blob image sources are allowed by both sanitizer protocol policy
  and renderer CSP. Preview image failures receive visible error metadata and
  styling. PDF readiness waits for all images, rejects load failures/timeouts,
  and reports the failure through the existing status/toast path instead of
  exporting a broken document.
- Source mode applies CJK punctuation normalization on blur/composition end and
  optional CJK/Latin spacing when configured. Selection mapping, IME deferral,
  `Process` handling, and canonical CRLF restoration are covered.
- Highlighting and KaTeX run between an initial user-input sanitizer and a
  final sanitizer with explicit KaTeX/MathML/hljs tags, classes, attributes,
  styles, and safe image protocols. Hostile protocol/HTML tests and complex
  KaTeX/highlight preservation tests pass.
- Block render rejection retains the last successful HTML and displays an
  accessible error instead of silently blanking the preview.
- `documentStats` now counts readable AST text. It excludes front matter,
  fenced/inline code, math, raw HTML, definitions, link destinations, and
  Markdown delimiters; visible link labels and prose punctuation remain.
  Characters are grapheme clusters in the extracted readable text, with one
  newline between readable top-level blocks.
- Removed the unreachable highlighting branch and made render-only reference
  and footnote support text use the document's line-ending convention.

## TDD evidence

- Focused red run: 9 expected failures across currency math, final sanitation,
  blob images, source normalization, statistics, image readiness, and visible
  block errors.
- Parse-call guard was demonstrated red at 3 calls with model reuse removed,
  then green at 2 calls after restoration.
- The full-suite PDF regression initially exposed the old expectation that an
  image error permits export; it now verifies export is blocked and two visible
  error surfaces are populated.
- Existing footnote, list, formatting delimiter, math, code, CJK, CRLF,
  selection, IME, boundary, and drag regressions remain included in the full
  suite.

## Verification

- Focused remediation suite: 6 files, 135 tests passed.
- Full suite: 27 files, 327 tests passed.
- TypeScript renderer and Node projects passed.
- Production build passed: renderer, main, and preload bundles.
- Linux x64 AppImage packaging passed.

## Commits

- `e693a64` fix: harden markdown parsing and rendering
- `a1f5cde` fix: normalize source and surface preview failures
- `21cca7c` test: enforce PDF image failure handling
- `8b060c1` test: measure shared Markdown parse calls

## Concerns

- Standalone HTML exports preserve blob URLs, but blob URLs are session-scoped
  and therefore are not portable after the originating renderer session ends.
  HTTPS images remain network-dependent in HTML exports.
- The existing Vite large-chunk warning remains (`763.09 kB`, `233.46 kB`
  gzip), as does Electron Builder's duplicate dependency-reference warning.
  Both builds still exit successfully.
- Image loading behavior is covered in DOM/integration tests; no manual
  Electron network/PDF smoke test was run in this headless environment.
