# Task 3 report

## Files

- `src/App.tsx` — application shell, file/export commands, shortcuts, and view preferences.
- `src/components/LiveEditor.tsx` — source-backed block editor, sanitized live preview, IME handling, keyboard behavior, CJK movement, and formatting.
- `src/components/Icons.tsx` — accessible inline-SVG icon set.
- `src/components/TitleBar.tsx` — draggable document/window chrome.
- `src/components/Toolbar.tsx` — file, formatting, and view controls.
- `src/components/StatusBar.tsx` — errors, path, and document statistics.
- `src/hooks/useDocument.ts` — reducer and Electron file workflows.
- `src/styles.css` — responsive editorial, A4, focus, light, dark, print, and CJK typography.
- `src/main.tsx` — mounts the new application and stylesheet.
- `src/hooks/useDocument.test.ts` — reducer behavior coverage.
- `src/components/LiveEditor.test.ts` — canonical replacement, merge, formatting, and CJK navigation coverage.

## TDD evidence

RED was observed before either production module existed:

```text
FAIL  src/components/LiveEditor.test.ts
Error: Cannot find module './LiveEditor'

FAIL  src/hooks/useDocument.test.ts
Error: Cannot find module './useDocument'

Test Files  2 failed (2)
Tests  no tests
```

The same targeted suite passed after implementation:

```text
Test Files  2 passed (2)
Tests  7 passed (7)
Duration  289ms
```

## Exact required verification output

Command: `npm run typecheck && npm test`

```text
> qingshu@2.1.0 typecheck
> tsc --project tsconfig.json --pretty false && tsc --project tsconfig.node.json --pretty false

> qingshu@2.1.0 test
> vitest run

 RUN  v4.1.10 /workspace

 Test Files  5 passed (5)
      Tests  41 passed (41)
   Start at  18:51:41
   Duration  479ms (transform 161ms, setup 0ms, import 628ms, tests 157ms, environment 0ms)
```

Exit code: `0`.

## Commit

Implementation commit: `b2291bb` (`Implement source-backed live preview editor`).

The follow-up commit contains the source synchronization self-review fix and this report.

## Self-review

- Confirmed inactive rendering uses the existing sanitized `renderMarkdown` export and never stores rendered HTML as document state.
- Confirmed every edit reconstructs content around exact source offsets; a content ref prevents rapid input/IME events from applying to stale React props.
- Corrected merged-block caret placement from document-relative to block-relative coordinates.
- Confirmed composition events bypass key normalization until composition ends.
- Confirmed all UI symbols are inline SVGs with button labels and tooltips.
- Confirmed the responsive/mobile, A4, focus, light/dark, print, code, table, and CJK type styles are local-only.
- Re-read all Task 3 checklist items and found each represented in implementation.

## Concerns

- Editor interaction tests exercise the source-operation behavior directly rather than through a browser DOM. The repository has no DOM test environment; typechecking and all 41 Vitest tests pass, but Electron-level IME and native window interactions still merit manual platform smoke testing.

## Critical/Important review remediation

### Files

- `src/components/LiveEditor.tsx` — synchronizes externally replaced active blocks and ranges, maintains internal draft provenance, provides all-preview printing, preserves link interactivity, applies ongoing IME-safe CJK spacing, preserves transformed carets, and supports Ctrl+Shift+CJK selection.
- `src/App.tsx` — waits for an all-rendered preview before PDF export, adds focus-mode UI/Escape exits, confirms custom closes, and connects automatic spacing.
- `src/components/TitleBar.tsx` — delegates close policy to the application.
- `src/components/StatusBar.tsx` — limits live announcements to actual errors.
- `src/styles.css` — styles non-nested preview activation and the always-available focus exit.
- `src/App.test.tsx` — covers New/Open replacement, focus exits, dirty close, and PDF preview.
- `src/components/LiveEditor.dom.test.tsx` — covers same-index replacement, shifted ranges, preview links, print rendering, IME spacing/caret integrity, and Ctrl+Shift selection.
- `package.json`, `package-lock.json` — add current `@testing-library/react` and `jsdom` test dependencies.

### TDD red evidence

Command:

```text
npm test -- src/components/LiveEditor.dom.test.tsx src/App.test.tsx
```

Result before fixes:

```text
FAIL  src/App.test.tsx > document replacement > clears the same active block when creating a new document
AssertionError: expected 'Draft' to be ''

FAIL  src/App.test.tsx > document replacement > loads opened content into the same active block
AssertionError: expected '' to be '# Opened'

FAIL  src/App.test.tsx > application safety controls > keeps focus mode escapable by both UI and Escape
TestingLibraryElementError: Unable to find role="button" and name "Exit focus mode"

FAIL  src/App.test.tsx > application safety controls > confirms dirty documents before a custom window close
AssertionError: expected "bound " to be called 1 times, but got 0 times

FAIL  src/components/LiveEditor.dom.test.tsx > LiveEditor state synchronization > synchronizes the active draft after a same-index document replacement
AssertionError: expected 'Old document' to be 'Opened document'

FAIL  src/components/LiveEditor.dom.test.tsx > LiveEditor state synchronization > updates the active range when an earlier block changes length
AssertionError: expected "中文 text\n\nSecond!", received corrupted "中文 text\nSecond!d"

FAIL  src/components/LiveEditor.dom.test.tsx > LiveEditor state synchronization > renders all blocks as preview while printing
AssertionError: expected active textarea to be null

FAIL  src/components/LiveEditor.dom.test.tsx > LiveEditor state synchronization > keeps rendered links interactive without button nesting
AssertionError: expected link role=button ancestor to be null

FAIL  src/components/LiveEditor.dom.test.tsx > LiveEditor keyboard and composition behavior > applies automatic spacing after IME composition completes
AssertionError: expected "中文 text", received "中文text"

FAIL  src/components/LiveEditor.dom.test.tsx > LiveEditor keyboard and composition behavior > extends selection for Ctrl+Shift+Arrow CJK movement
AssertionError: expected selectionStart 0, received 2

Test Files  2 failed (2)
Tests  10 failed | 1 passed (11)
Duration  3.06s
```

This was the expected behavioral red for ten requested paths. During self-review, the
PDF assertion was moved outside the mocked IPC implementation so application error
handling could not swallow it; the strengthened test holds export pending and verifies
the live DOM before allowing editing to resume.

### Targeted green evidence

Command:

```text
npm test -- src/components/LiveEditor.dom.test.tsx src/App.test.tsx
```

Exact result:

```text
> qingshu@2.1.0 test
> vitest run src/components/LiveEditor.dom.test.tsx src/App.test.tsx

 RUN  v4.1.10 /workspace

 Test Files  2 passed (2)
      Tests  11 passed (11)
   Start at  19:00:43
   Duration  1.07s (transform 107ms, setup 0ms, import 498ms, tests 485ms, environment 807ms)
```

Exit code: `0`.

### Full green verification

Command:

```text
npm run typecheck && npm test
```

Exact result:

```text
> qingshu@2.1.0 typecheck
> tsc --project tsconfig.json --pretty false && tsc --project tsconfig.node.json --pretty false

> qingshu@2.1.0 test
> vitest run

 RUN  v4.1.10 /workspace

 Test Files  7 passed (7)
      Tests  52 passed (52)
   Start at  19:00:45
   Duration  1.19s (transform 245ms, setup 0ms, import 1.16s, tests 705ms, environment 920ms)
```

Exit code: `0`.

### Commit

Review remediation commit: `64412cb` (`Fix stateful live editor review findings`).

### Self-review

- External content provenance now distinguishes parent-driven New/Open/spacing changes from the editor's own controlled updates; both source and exact offsets reset together.
- Rapid editor updates still compose against the latest canonical source via refs, while parent acknowledgements no longer erase parser-excluded trailing newlines.
- PDF export changes the active block to sanitized preview with all other blocks, waits two paint frames for async Markdown rendering, and restores editing in `finally`.
- Rendered links are no longer descendants of an interactive role. Link clicks retain their native behavior and do not activate the block; a sibling accessible edit button provides keyboard activation.
- Automatic spacing remains enabled for future edits, defers transformation during composition, and maps selection offsets through the same CJK transform.
- Focus mode always exposes a fixed exit control and handles Escape.
- The custom title-bar close is now guarded by the same dirty-document confirmation as New/Open.
- Status counts no longer sit in an `aria-live` container; errors alone use `role="alert"`.
- Dependency audit after adding DOM tests reported `0 vulnerabilities`.

### Remaining concerns

- Browser DOM regressions now cover the stateful paths. Native Electron print timing, OS-level IME event ordering, and custom window controls still benefit from a manual packaged-app smoke test on each supported desktop OS.

## Final Task 3 review remediation

### Scope and files

- `src/components/LiveEditor.tsx` replaces string-history provenance with an explicit pending-parent-acknowledgement protocol. Each changed parent value is consumed exactly once; unmatched values always reset draft and source offsets.
- `src/components/LiveEditor.dom.test.tsx` adds the exact `emit B → external C → external B → edit` regression and verifies print preview has no edit controls.
- `src/types/electron.d.ts` and `electron/preload/index.ts` expose only close-intent subscription and close-response IPC.
- `electron/main/index.ts` owns native closure. It intercepts window and application quit intents, asks the renderer about dirty state, rejects unsolicited responses, and permits exactly one confirmed close without recursion.
- `electron/main/index.test.ts` distinguishes intent, rejection/retry, confirmed close, and application quit confirmation.
- `src/App.tsx` answers native close intents through `canDiscard`, routes the custom control into the same main-owned flow, and suppresses the focus exit during PDF rendering.
- `src/App.test.tsx` covers rejected/confirmed renderer responses, custom-close routing, and hidden print controls.
- `src/styles.css` also hides focus and block-edit controls in native print media.

### TDD red evidence

Command:

```text
npm test -- src/components/LiveEditor.dom.test.tsx src/App.test.tsx electron/main/index.test.ts
```

Exact summary before implementation:

```text
FAIL  electron/main/index.test.ts (14 tests | 3 failed)
FAIL  src/components/LiveEditor.dom.test.tsx (7 tests | 2 failed)
FAIL  src/App.test.tsx (6 tests | 3 failed)

Test Files  3 failed (3)
     Tests  8 failed | 19 passed (27)
  Duration  1.11s (transform 141ms, setup 0ms, import 555ms, tests 519ms, environment 857ms)
```

The failures specifically showed:

```text
expected 'C' to be 'B'
Found multiple elements with the text of: Edit Markdown block
expected "vi.fn()" to be called with arguments: [ 'close' ]
expected native confirm to be called 1 times, but got 0 times
expected Exit focus mode control to be null during PDF preview
expected qingshu:close-response among registered channels
TypeError: main.installCloseHandshake is not a function
```

An additional app-shutdown regression was added and observed red:

```text
Command: npm test -- electron/main/index.test.ts

FAIL  electron/main/index.test.ts (15 tests | 1 failed)
AssertionError: expected before-quit preventDefault to be called once, but got 0 times

Test Files  1 failed (1)
     Tests  1 failed | 14 passed (15)
  Duration  176ms (transform 55ms, setup 0ms, import 69ms, tests 16ms, environment 0ms)
```

### Focused green evidence

Command:

```text
npm test -- electron/main/index.test.ts src/components/LiveEditor.dom.test.tsx src/App.test.tsx
```

Exact result:

```text
> qingshu@2.1.0 test
> vitest run electron/main/index.test.ts src/components/LiveEditor.dom.test.tsx src/App.test.tsx

 RUN  v4.1.10 /workspace

 Test Files  3 passed (3)
      Tests  28 passed (28)
   Start at  19:07:31
   Duration  1.20s (transform 159ms, setup 0ms, import 565ms, tests 530ms, environment 1.02s)
```

Exit code: `0`.

### Full verification and Vite build

Command:

```text
npm run typecheck && npm test && npx vite build
```

Exact result:

```text
> qingshu@2.1.0 typecheck
> tsc --project tsconfig.json --pretty false && tsc --project tsconfig.node.json --pretty false

> qingshu@2.1.0 test
> vitest run

 RUN  v4.1.10 /workspace

 Test Files  7 passed (7)
      Tests  55 passed (55)
   Start at  19:07:42
   Duration  1.20s (transform 216ms, setup 0ms, import 1.20s, tests 663ms, environment 908ms)

vite v8.2.1 building client environment for production...
✓ 321 modules transformed.
dist/index.html                   0.59 kB │ gzip:   0.36 kB
dist/assets/index-yVlywBe4.css    6.74 kB │ gzip:   2.29 kB
dist/assets/index-DVIYKWvI.js   642.41 kB │ gzip: 196.33 kB
✓ built in 202ms

vite v8.2.1 building client environment for production...
✓ 2 modules transformed.
dist-electron/main/index.js  4.55 kB │ gzip: 1.84 kB
✓ built in 8ms

vite v8.2.1 building client environment for production...
✓ 2 modules transformed.
dist-electron/preload/index.js  0.72 kB │ gzip: 0.29 kB
✓ built in 5ms
```

Exit code: `0`. Vite emitted its advisory that the renderer chunk exceeds 500 kB after minification.

### Commit

Implementation commit: `92e3ce8` (`Secure native close and editor synchronization`).

### Self-review

- Parent acknowledgements are no longer inferred from any historical emitted string. A pending acknowledgement is consumed on the next changed parent value and cleared whether it matches or not, so later external reuse of that text cannot be mistaken for an acknowledgement.
- Internal rapid edits continue to use canonical content/range refs, while external parent values reset source and offsets together.
- The main process retains the only authority to close. Renderer responses are sender-validated, ignored without a pending intent, and only literal `true` permits closure.
- A one-close allowance prevents the confirmed `close()` call from recursively opening another confirmation.
- Rejected app quit clears all pending quit state. Confirmed application quit grants each participating window one close and restarts `app.quit()`, covering Cmd+Q and shutdown in addition to window-manager close controls.
- Both DOM structure and print CSS remove edit/focus controls from PDF and native print output.
- Focused renderer/main tests, all 55 tests, both TypeScript projects, and renderer/main/preload Vite builds pass.

### Remaining concern

- The renderer bundle is 642.41 kB minified, so Vite reports a chunk-size advisory. This is primarily the Markdown/KaTeX stack and is outside the functional review scope; code splitting can be considered separately.
