# Final Review Fixes Report

## Outcome

All six Important findings and all three valid Minor findings were verified
against the pre-fix code and implemented. No finding warranted pushback:

1. `qingshu:save-file` accepted any renderer-supplied path.
2. document saves used direct `writeFile` with no revision/conflict check.
3. normal preview rendered isolated blocks without document definitions.
4. CJK transforms protected code/math/URLs but not presentation metadata.
5. rendered block keys included source offsets and statistics were synchronous.
6. electron-builder still used `YourAppID` and had no application icons.
7. macOS native controls coexisted with custom controls, status omitted active/save
   state, and bridge errors were announced assertively twice.

## Implemented changes

- Main process maintains per-renderer authorized document paths established only
  through Open/Save dialogs. Existing-path saves reject unrecognized paths while
  Save As continues to use the native dialog.
- Open and Save establish/update a revision containing device, inode, mtime, and
  size. A changed or replaced target rejects with a renderer-visible conflict
  message.
- Document writes use an adjacent `wx` temp file, file `fsync`, close, atomic
  rename, and best-effort cleanup on failure.
- Normal block preview receives document-level link definitions and footnote
  definitions. Per-block footnote sections are removed; one sanitized document
  section is rendered at the end with globally unique reference IDs.
- Content-derived block IDs preserve unchanged React block instances after
  preceding edits. Non-active rendering is deferred, unchanged blocks are
  memoized, and status statistics are debounced. A deterministic 160-block test
  proves an active-block edit causes zero additional inactive render calls.
- CJK transforms now protect AST HTML ranges plus explicit YAML/TOML front matter,
  Slidev directives, and component ranges. Realistic Marp and Slidev fixtures
  cover normalization and spacing.
- Packaging uses `com.qingshu.editor`, product/desktop metadata, Linux `Office`
  category and desktop-name synchronization, and local original book/leaf SVG,
  generated PNG, and generated ICO assets. Linux AppImage and Windows unpacked
  packaging both validate successfully.
- Custom window controls are omitted on macOS, the status bar shows active block
  and Saved/Unsaved state, and only the toast is an assertive error announcement.

## TDD evidence

Focused tests were introduced and observed failing before each behavior change:

- `electron/main/index.test.ts`: unauthorized path, external conflict, exclusive
  adjacent temp write, fsync/rename, revision update, and cleanup.
- `src/markdown/markdown.test.ts` and
  `src/components/LiveEditor.dom.test.tsx`: cross-block references/footnotes,
  unique IDs, stable DOM identity, and bounded large-document render calls.
- `src/markdown/cjk.test.ts`: realistic Marp and Slidev preservation.
- `src/components/StatusBar.test.tsx`, `src/components/TitleBar.test.tsx`, and
  `src/App.test.tsx`: deferred statistics, state display, macOS controls, and one
  assertive error.
- `electron-builder.test.ts`: stable identity, platform metadata, and icon assets.

## Commits

- `64b2444` — secure authorized, conflict-safe atomic document saves
- `0f71187` — correct filesystem revision typing
- `ddb1f2b` — document-wide preview context and stable deferred blocks
- `75e956a` — presentation-safe CJK transforms and README wording
- `0e9c52f` — status, accessibility, and platform chrome fixes
- `f28a727` — stable package identity and original icon assets
- `472a286` — synchronized Linux desktop identity

No commit was amended and nothing was pushed.

## Verification evidence

- Focused file IPC tests: 21/21 passed.
- Focused Markdown/live-editor tests: 19/19 passed.
- Focused CJK tests: 16/16 passed.
- Focused status/title/App tests: 18/18 passed.
- Packaging metadata tests: 2/2 passed.
- Full `npm test`: 14 files, 101 tests passed.
- `npm run typecheck`: passed.
- `npx vite build`: renderer, main, and preload bundles built.
- `npx electron-builder --publish never`: Linux x64 AppImage built.
- `npx electron-builder --win --x64 --dir --publish never`: Windows x64 unpacked
  package built and executable resources updated.

## Concerns

- Vite reports a non-failing advisory that the minified renderer chunk is about
  657 kB, above its 500 kB warning threshold. This is pre-existing bundle
  composition work, not a correctness failure.
- electron-builder reports duplicate dependency references while traversing the
  unified/remark dependency graph. Packaging succeeds.
- macOS DMG creation was not executed on this Linux agent. Its PNG icon and
  category configuration are covered by metadata tests; Linux and Windows package
  generation provide the available platform packaging evidence.
