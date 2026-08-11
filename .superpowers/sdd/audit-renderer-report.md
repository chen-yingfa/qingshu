# Renderer audit remediation report

## Status

Implemented the requested renderer remediation batch on
`cursor/codebase-simplification-5ed7`. No push or amend was performed.

## TDD evidence

- Source native formatting: regression test initially observed two canonical
  `onChange` commits for one successful `execCommand` + synchronous `input`;
  now one commit is emitted while native `insertText` remains the undo path.
- Shortcut scope: App regression created a new tab and changed mode from the
  toolbar font select; both shortcuts are now ignored outside editor textareas.
- Tab editor state: synthetic empty block was lost after a tab round trip;
  per-tab `insertedBlocks`/editing-boundary state is now retained without
  mounting inactive editors.
- Source default: changing the setting switched the current tab; it now affects
  only newly created/opened tabs.
- CJK normalization: call-count test observed three `normalizeCjkInput` calls
  per edit; normalization, optional spacing, and selection mapping now use one
  full-source transform.
- Parse hot paths: tests observed extra synchronous parses for heading Enter,
  first-boundary Backspace, and drag start. Those paths now derive from the
  current parsed model/block metadata; drag retains only the necessary parse of
  reordered output.
- Shell rendering: render counters observed Toolbar/TabStrip updates on a
  subsequent dirty-document keystroke; stable shell callbacks and memoized
  controls now keep both counts at zero.
- Accessibility tests failed first for unsafe recent-path option IDs, incomplete
  combobox metadata, escaping Settings bubbling to the window, a missing toast
  live region, and missing dirty title text. All now pass.
- Extraction module tests initially failed because the modules did not exist.
  `DocumentSourceEditor` and block drag controls are now focused modules used by
  `LiveEditor`; 274 lines of duplicated extracted UI were removed.

## Verification

- Full test suite: `26` files, `315` tests passed.
- TypeScript: renderer and Node projects passed.
- Production build: Vite renderer/main/preload builds and Linux AppImage
  packaging completed successfully.
- Focused extraction verification: `90` tests passed.
- Existing baseline functionality is preserved: all prior 300 tests remain
  included in the passing 315-test suite.

## Commits

- `7eaa198` fix: preserve renderer editing semantics
- `109a995` test: await restored tab preview
- `79659c7` perf: normalize CJK input in one pass
- `5e2a2e1` refactor: extract source and drag editor modules
- `363587f` fix: retain legacy pointer event type
- `697ea97` perf: reuse parsed editor models on hot paths
- `2b5942c` perf: isolate shell controls from editor keystrokes
- `d2322c0` fix: improve renderer accessibility semantics
- `7486c91` refactor: derive appearance state from settings
- `84fe685` refactor: remove extracted editor UI duplication

## Concerns

- The renderer bundle still reports Vite's pre-existing large-chunk warning
  (`760.21 kB`, `232.47 kB` gzip). Code splitting was outside this behavioral
  remediation batch.
- Electron Builder reports duplicate dependency references while discovering
  packaged modules; packaging still exits successfully.
- Automated DOM tests cover the Chromium `execCommand`/`input` ordering, but a
  manual Electron undo-stack smoke test was not run in this headless session.
