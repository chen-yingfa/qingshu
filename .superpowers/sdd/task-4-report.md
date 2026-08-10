# Task 4 report

## Status

`DONE_WITH_CONCERNS`

Task 4 is implemented without pushing the branch.

## Files

- `src/components/CommandPalette.tsx` — fuzzy ranking, searchable combobox/listbox,
  arrow wrapping, Enter execution, Escape/backdrop dismissal, and accessible command
  labels.
- `src/components/CommandPalette.test.tsx` — fuzzy, keyboard execution, empty-state,
  and Escape coverage.
- `src/components/Toast.tsx` — bounded success/error notification stack with
  accessible semantics, manual dismissal, and automatic expiry.
- `src/components/Toast.test.tsx` — toast semantics and lifecycle coverage.
- `src/export/html.ts` — complete UTF-8 document generation with sanitized rendered
  GFM/KaTeX, escaped title, embedded KaTeX layout rules, and editorial/print CSS.
- `src/export/html.test.ts` — standalone-document, no-remote-style, GFM, and KaTeX
  export assertions.
- `src/App.tsx` — shared command routing, Ctrl/Cmd shortcuts, palette command list,
  operation toasts, safe export dialogs, and existing native close handshake.
- `src/App.test.tsx` — shortcut, command, toast, and renderer-to-export integration.
- `src/hooks/useDocument.ts` — typed success/canceled/error results around the
  existing document reducer and bridge calls.
- `src/main.tsx` — local packaged KaTeX styles for in-app rendering.
- `src/styles.css` — responsive light/dark palette and toast presentation, focus
  states, reduced motion, and print exclusion.
- `README.md` — current React/Electron architecture, features, CJK behavior,
  shortcuts, setup/build, packaging, and limitations.

## TDD red evidence

Initial command:

```text
npm test -- src/components/CommandPalette.test.tsx src/components/Toast.test.tsx src/export/html.test.ts src/App.test.tsx
```

Observed before production modules and integration existed:

```text
FAIL  src/components/CommandPalette.test.tsx
Failed to resolve import "./CommandPalette"

FAIL  src/components/Toast.test.tsx
Failed to resolve import "./Toast"

FAIL  src/export/html.test.ts
Cannot find module './html'

FAIL  src/App.test.tsx (11 tests | 3 failed)
Unable to find role "combobox" and name "Search commands"
Unable to find command options
Unable to find role "status"

Test Files  4 failed (4)
Tests  3 failed | 8 passed (11)
Exit code: 1
```

The first integration green attempt then exposed a real ranking defect: the keyword
`a4` on Export PDF outranked the literal `A4` in Toggle A4 preview.

```text
FAIL  src/App.test.tsx > opens the palette with Ctrl+P...
AssertionError: a4: expected false to be true
```

After self-review, focused-option Escape dismissal was added test-first:

```text
npm test -- src/components/CommandPalette.test.tsx -t "focus moves"

FAIL  ... dismisses with Escape after focus moves to a command option
AssertionError: expected "vi.fn()" to be called once, but got 0 times
Test Files  1 failed (1)
Tests  1 failed | 4 skipped (5)
Exit code: 1
```

## Targeted green evidence

Command:

```text
npm test -- src/components/CommandPalette.test.tsx src/components/Toast.test.tsx src/export/html.test.ts src/App.test.tsx
```

Result:

```text
Test Files  4 passed (4)
Tests  19 passed (19)
Duration  1.38s
Exit code: 0
```

Focused Escape regression:

```text
npm test -- src/components/CommandPalette.test.tsx

Test Files  1 passed (1)
Tests  5 passed (5)
Duration  695ms
Exit code: 0
```

## Exact final verification

Command:

```text
npm test && npm run build
```

Result:

```text
> qingshu@2.1.0 test
> vitest run

Test Files  10 passed (10)
Tests  69 passed (69)
Duration  1.90s

> qingshu@2.1.0 build
> npm run typecheck && vite build && electron-builder

> qingshu@2.1.0 typecheck
> tsc --project tsconfig.json --pretty false && tsc --project tsconfig.node.json --pretty false

Renderer: 326 modules transformed; built in 207ms
Main: 2 modules transformed; built in 8ms
Preload: 2 modules transformed; built in 5ms
Packaged Linux x64:
  release/2.1.0/linux-unpacked
  release/2.1.0/qingshu_2.1.0_amd64.snap
  release/2.1.0/qingshu-2.1.0.AppImage

Exit code: 0
```

This runs the requested `npm run build` in full, including both TypeScript projects,
all Vite bundles, electron-builder packaging, Snap, and AppImage generation.

## Commits

- `c31681c` — `Add command palette and standalone exports`
- `2a17232` — `Refine palette ranking and accessibility`
- `0a4b0d9` — `Keep palette Escape dismissal accessible`

The report is committed separately after these implementation commits.

## Self-review

- Reused `runCommand`, `useDocument`, and `window.qingshu`; no duplicate file or
  export bridge was introduced.
- New/Open still call `canDiscard`, while title-bar close still requests a native
  close and answers only a main-process close intent. All prior lifecycle tests pass.
- Export no longer passes the Markdown source path as an output path, avoiding an
  accidental overwrite of the source file; native save dialogs select HTML/PDF
  destinations.
- HTML has doctype, language, UTF-8 metadata, escaped source-derived title, viewport,
  rendered sanitized body, and one inline style block. Tests reject stylesheet links,
  imports, font URLs, and raw math Markdown.
- KaTeX styling is bundled locally for the app. Export strips font-face URLs while
  preserving KaTeX layout CSS and fallback font families.
- Fuzzy label matches outrank keyword-only matches, so `a4` selects the view command,
  while keyword searches such as `web` still find HTML export.
- Palette focus starts in the combobox. Arrow selection wraps, Enter runs, Escape
  works from both the input and options, and visible shortcuts are included in option
  accessible names.
- Toasts are capped at three, expire, can be dismissed, and distinguish success and
  error semantics.
- Re-read every Task 4 brief checkbox and confirmed coverage in implementation and
  tests.

## Concerns

- Vite reports the renderer chunk at 681.71 kB minified, above its 500 kB advisory.
  The Markdown/KaTeX stack is the main contributor; code splitting remains future
  optimization work.
- electron-builder reports duplicate transitive dependency references and missing
  Linux `desktopName`, category, and custom icon metadata. Packaging still completes,
  but Linux shell integration/branding should be configured separately.
- HTML CSS and math are self-contained, but Markdown image URLs are intentionally not
  downloaded or converted to data URIs.
- Native dialogs, packaged printing, IME event ordering, and custom chrome were
  covered by automated boundaries but not manually smoke-tested on each desktop OS.
