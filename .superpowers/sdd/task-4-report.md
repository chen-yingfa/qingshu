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
  GFM, accessible MathML, an escaped title, and standalone editorial/print CSS.
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
- KaTeX produces standards-based MathML for the app and export. The duplicate visual
  span is hidden, and neither path bundles or references KaTeX font assets.
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

- Vite reports the current renderer chunk at 653.21 kB minified, above its 500 kB
  advisory. The Markdown/KaTeX runtime remains the main contributor; code splitting
  remains future optimization work.
- electron-builder reports duplicate transitive dependency references and missing
  Linux `desktopName`, category, and custom icon metadata. Packaging still completes,
  but Linux shell integration/branding should be configured separately.
- HTML CSS and math are self-contained, but Markdown image URLs are intentionally not
  downloaded or converted to data URIs.
- Native dialogs, packaged printing, IME event ordering, and custom chrome were
  covered by automated boundaries but not manually smoke-tested on each desktop OS.

## Important finding remediation

### Scope

- `src/components/LiveEditor.tsx` now renders print mode from the entire canonical
  Markdown source in one sanitized render. Footnote definitions and references are no
  longer separated by editor block boundaries.
- `src/markdown/markdown.ts` preserves the renderer's generated footnote IDs through
  sanitization, so sanitized reference targets resolve.
- `src/export/html.ts` exports KaTeX-generated standards-based MathML, hides the
  font-dependent visual span, and contains no KaTeX font CSS or asset references.
  The application uses the same MathML presentation and no longer bundles KaTeX font
  files.
- `src/print/readiness.ts` waits for the committed full-document render,
  `document.fonts.ready` when available, and the load/error completion of every
  current image before renderer IPC requests PDF generation.
- `src/components/CommandPalette.tsx` centralizes arrows, Enter, Escape, and Tab
  handling at the dialog boundary, traps forward/reverse focus, and restores the
  element that opened the palette.
- `src/types/electron.d.ts`, `electron/preload/index.ts`, and
  `electron/main/index.ts` remove HTML/PDF export paths from the renderer contract.
  Export handlers always display native save dialogs and every IPC handler validates
  the arity, type, allowed values, and object keys of its payload at runtime.
- Command shortcuts display `⌘`/`⇧` labels on Apple platforms and Ctrl labels
  elsewhere. Toast close buttons include their notification message in the accessible
  name.
- `README.md` now describes the MathML and font-independent export behavior.

### TDD red evidence

Command:

```text
npm test -- src/components/LiveEditor.dom.test.tsx src/export/html.test.ts src/print/readiness.test.ts src/components/CommandPalette.test.tsx src/components/Toast.test.tsx src/App.test.tsx electron/main/index.test.ts
```

Observed before remediation:

```text
FAIL  src/components/CommandPalette.test.tsx (8 tests | 3 failed)
  traps Tab and Shift+Tab within every dialog control
  handles arrows from an option and returns focus to the combobox
  restores focus to the opener after dismissal

FAIL  src/print/readiness.test.ts
  Failed to resolve import "./readiness"

FAIL  src/App.test.tsx (13 tests | 2 failed)
  expected 3 rendered blocks to have a length of 1
  TypeError: formatShortcut is not a function

FAIL  src/export/html.test.ts (4 tests | 2 failed)
  cross-block footnote target ID did not resolve
  standalone MathML CSS/font-independence assertion failed

FAIL  electron/main/index.test.ts (17 tests | 2 failed)
  renderer HTML path bypassed the native dialog
  malformed IPC payloads resolved instead of rejecting

FAIL  src/components/LiveEditor.dom.test.tsx (7 tests | 1 failed)
  full-source footnote reference was rendered as literal Markdown

FAIL  src/components/Toast.test.tsx (2 tests | 2 failed)
  notification dismissal controls had indistinguishable names

Test Files  7 failed (7)
Tests  12 failed | 39 passed (51)
Exit code: 1
```

This red run also exposed a pre-existing sanitization mismatch: generated footnote
references linked to `#user-content-fn-*`, while sanitization prefixed the definition
ID a second time. The remediation keeps generated IDs intact; raw HTML remains
disabled before sanitization.

### Targeted green evidence

The same command after implementation:

```text
Test Files  7 passed (7)
Tests  53 passed (53)
Duration  2.00s
Exit code: 0
```

Added coverage includes full-document footnotes in print and HTML, complex MathML,
font-asset exclusion, render/font/image readiness ordering, image error completion,
focus wrap/restoration, dialog-wide arrows/Escape, platform labels, distinct toast
controls, export-path rejection, and malformed payload rejection for every IPC
channel.

### Exact final verification

Command:

```text
npm test && npm run typecheck && npx vite build && npx electron-builder
```

Result:

```text
> qingshu@2.1.0 test
> vitest run

Test Files  11 passed (11)
Tests  80 passed (80)
Duration  2.34s

> qingshu@2.1.0 typecheck
> tsc --project tsconfig.json --pretty false && tsc --project tsconfig.node.json --pretty false

Renderer: 325 modules transformed; built in 177ms
  dist/assets/index-Cp1jcHVS.css  10.24 kB (gzip 3.15 kB)
  dist/assets/index-kTBsCkhN.js  652.05 kB (gzip 199.76 kB)
Main: 2 modules transformed; built in 9ms
Preload: 2 modules transformed; built in 6ms
Packaged Linux x64:
  release/2.1.0/linux-unpacked
  release/2.1.0/qingshu_2.1.0_amd64.snap
  release/2.1.0/qingshu-2.1.0.AppImage

Exit code: 0
```

No KaTeX `.woff`, `.woff2`, or `.ttf` assets are emitted after switching visual math
to MathML.

### Commit

- `b0b475c` — `Harden document exports and palette accessibility`

This appended evidence is committed separately without amending prior commits.

### Self-review

- Print readiness cannot resolve until the full-source renderer's post-commit layout
  effect signals success. Render failures reject the barrier and follow the existing
  error-toast/finally restoration path.
- Font readiness is feature-detected. Images already complete are accepted; pending
  images resolve on either load or error, preventing broken images from hanging an
  export after their terminal state.
- PDF IPC is invoked only after readiness; the main process still owns native path
  selection and `printToPDF`.
- Sanitized full-document rendering is used for print and the existing full-source
  sanitized pipeline is used for HTML, preserving one source of rendering semantics.
- MathML remains exposed to accessibility APIs. Only KaTeX's duplicate
  `aria-hidden` visual HTML is hidden with standalone CSS.
- Export payloads reject unknown keys, wrong types, extra arguments, invalid actions,
  and non-boolean close responses before side effects.
- The dirty-close handshake itself is unchanged and all main/renderer lifecycle tests
  remain green.

### Remaining concerns

- Vite still reports the renderer JavaScript chunk at 652.05 kB minified, above its
  500 kB advisory, although removing KaTeX font styling reduced JavaScript and CSS
  output and eliminated dozens of font files.
- electron-builder still reports duplicate transitive dependency references and
  missing Linux desktop name/category/icon metadata. Packaging completes.
- Referenced Markdown images remain external in HTML exports; styling and equations
  are self-contained.
- Native printing, MathML presentation, IME ordering, and custom chrome were not
  manually smoke-tested across all target operating systems.

## Final review closure

### Changes

- `src/print/readiness.ts` applies one 15-second bound to pending image readiness.
  Load and error both count as terminal states. Timeout and abort paths remove every
  image and signal listener before rejecting with a user-facing error message.
- Render and font readiness are abortable as well. Image readiness starts immediately
  after the committed full-document render and runs alongside font readiness, so no
  image terminal event is missed while fonts settle.
- `src/App.tsx` owns exactly one active PDF operation. A rapid duplicate command
  cannot replace its barrier or controller and produces the existing error toast:
  `PDF export is already in progress.`
- Component teardown aborts pending readiness. Normal completion aborts only after
  readiness/native export is finished and clears the active operation by identity.
- `src/print/readiness.test.ts` covers a never-settling image timeout and explicit
  cancellation. `src/App.test.tsx` covers a duplicate command while native PDF export
  is pending and verifies only one bridge invocation.

### TDD red evidence

Command:

```text
npm test -- src/print/readiness.test.ts src/App.test.tsx
```

Observed before implementation:

```text
FAIL  src/App.test.tsx
  rejects a rapid duplicate PDF command without replacing the active export
  Unable to find: PDF export is already in progress.

FAIL  src/print/readiness.test.ts
  rejects after a bounded timeout when an image never settles
  Test timed out in 5000ms

FAIL  src/print/readiness.test.ts
  cancels pending readiness and removes image listeners
  Test timed out in 5000ms

Test Files  2 failed (2)
Tests  3 failed | 15 passed (18)
Exit code: 1
```

### Focused green evidence

The same focused command after implementation:

```text
Test Files  2 passed (2)
Tests  18 passed (18)
Duration  1.36s
Exit code: 0
```

### Exact final verification

Command:

```text
npm test && npm run typecheck && npx vite build
```

Result:

```text
> qingshu@2.1.0 test
> vitest run

Test Files  11 passed (11)
Tests  83 passed (83)
Duration  2.23s

> qingshu@2.1.0 typecheck
> tsc --project tsconfig.json --pretty false && tsc --project tsconfig.node.json --pretty false

Renderer: 325 modules transformed; built in 184ms
  dist/assets/index-Cp1jcHVS.css  10.24 kB (gzip 3.15 kB)
  dist/assets/index-DuOR99A8.js  653.21 kB (gzip 200.18 kB)
Main: 2 modules transformed; built in 9ms
Preload: 2 modules transformed; built in 6ms

Exit code: 0
```

### Commit

- `65915bc` — `Bound and serialize PDF export readiness`

This report correction and final evidence are committed separately without amending
prior commits.

### Final self-review and concerns

- A pending image can no longer strand PDF export indefinitely. Its timeout rejection
  follows the same `runCommand` catch path that updates the status error and adds an
  error toast, while `finally` restores edit mode.
- A duplicate command is rejected synchronously before changing preview state or
  creating a second barrier.
- The prior report's claims about bundled KaTeX CSS/fonts and 681.71 kB current output
  were stale and are corrected above.
- The remaining build concern is Vite's renderer chunk-size advisory. Native PDF
  printing was not manually smoke-tested on every target OS in this environment.
