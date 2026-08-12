# WYSIWYG Markers and Toolbar Tooltips Report

## Status

Implemented on `cursor/wysiwyg-markers-tooltips-5ed7` without pushing or
amending commits.

## Delivered

- Added a marker projection API with canonical-to-visible and
  visible-to-canonical offset mapping plus visible-edit reconstruction.
- Active top-level unordered, ordered, zero-padded ordered, parenthesized
  ordered, and task list items hide their own marker while retaining exact
  canonical source and nested child source.
- Active task items render one disabled task checkbox in the marker position;
  ordered items use accessible custom markers so `3)` and zero-padded forms
  remain visually faithful while retaining semantic `ol`/`li` values.
- Active blockquotes hide each line's quote prefix, render quote styling
  immediately, preserve nested quote depth and CRLF, continue on Enter, and
  exit an empty quote line.
- Marker projection is bypassed for source mode, fenced code, display math,
  and frontmatter.
- Existing list interactions were retained across Enter, empty exit, Tab and
  Shift+Tab nesting, Backspace marker exit, controlled undo, IME,
  acknowledgement rerenders, formatting requests, drag/reorder, CRLF, and
  source-mode round trips.
- Every toolbar button, including Recent Files, now has a custom tooltip for
  hover and keyboard focus. Tooltips use measured viewport-fixed positioning,
  clamping/flipping, independent hover/focus state, theme variables, modest
  animation, and a reduced-motion override without duplicate native titles.

## TDD Evidence

- `markerProjection.test.ts` first failed because the requested projection
  module did not exist, then passed after the API implementation.
- Marker DOM tests first failed against canonical textarea values, then passed
  after projection integration.
- Toolbar tests first failed because buttons lacked `aria-describedby` and
  custom tooltip state, then passed after tooltip implementation.
- The projected formatting test first exposed marker-inclusive selection
  formatting (`**- it**em`), then passed after canonical selection mapping.
- Existing exhaustive list tests were updated to assert visible caret/value
  behavior while retaining canonical `onChange` assertions.

## Commits

- `9f471e9` — feat: project list and quote markers from active editor
- `e743a4e` — feat: add accessible toolbar tooltips
- `1e2a0b0` — test: align list interactions with marker projection
- `5fb9e3e` — test: map projected list selections
- `3655aea` — test: cover projected quote and formatting interactions
- `a0036cb` — fix: map projected toolbar formatting selections
- `47b28e1` through `fcc31a0` — harden quote boundaries, marker rendering,
  tooltip positioning, projected undo/redo, and atomic IME history

## Verification

- `npm test` — 30 test files passed, 601 tests passed.
- `npm run typecheck` — passed both renderer and Node TypeScript projects.
- `npm run build` — passed Vite renderer/main/preload builds and
  electron-builder Linux AppImage packaging.

## Concerns

- Vite reports the existing renderer chunk-size warning: the main minified
  renderer chunk is 800.54 kB, above the default 500 kB advisory threshold.
  This does not fail the build.
- Automated DOM and CSS assertions cover behavior and accessibility. No
  interactive visual inspection was available in this headless run.
