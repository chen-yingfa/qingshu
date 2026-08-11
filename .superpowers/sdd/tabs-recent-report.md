# Tabs and Recent Files Implementation Report

Status: DONE_WITH_CONCERNS

## Delivered

- Independent tab state for content, canonical path, dirty flag, active block,
  content revision, error, and latest save request.
- New/Open create tabs; opening the same canonical path activates the existing
  tab without replacing its content.
- Accessible horizontal top tabs and vertical left-sidebar tabs with roving
  focus, arrow/Home/End navigation, close controls, and unsaved labels.
- Persistent tab placement in Settings.
- Per-tab dirty-close confirmation, at-least-one-tab behavior, and native close
  confirmation across every open tab.
- Main-process recent-file persistence under `app.getPath('userData')` with
  mode `0600`, canonical-path validation, renderer sender validation, bounded
  recency, and authorization restricted to stored entries.
- Missing recent entries are removed and returned to the renderer for warning
  feedback, including disappearance races during open.
- Dynamic recent entries in the command palette and a compact toolbar menu.
  Open, Save/Save As (including durability-warning commits), and recent-open
  operations refresh recency.
- Existing source mode, settings, hotkeys, block reorder, export behavior, and
  close handshake remain covered by the complete regression suite.

## TDD red/green evidence

1. Tab reducer
   - RED: `npm test -- src/hooks/useDocument.test.ts`
   - Expected result: 3 failures because `initialTabsState`/`tabsReducer` did
     not exist.
   - GREEN: reducer plus existing save lifecycle:
     `2 passed`, `12 passed`.
2. Accessible tab strip
   - RED: `npm test -- src/components/TabStrip.test.tsx`
   - Expected result: unresolved `./TabStrip`.
   - GREEN: `1 passed`.
3. Tab placement settings
   - RED:
     `npm test -- src/settings.test.ts src/components/SettingsDialog.test.tsx`
   - Expected result: 2 failures for absent persisted orientation and control.
   - GREEN: `2 passed`, `8 passed`.
4. Secure recent files
   - RED: `npm test -- electron/main/index.test.ts`
   - Expected result: 3 failures for missing list/open channels.
   - GREEN: `1 passed`, initially `52 passed`.
5. Missing-file race
   - RED:
     `npm test -- electron/main/index.test.ts -t "disappears after canonical"`
   - Expected result: raw `missing` error instead of removal/reporting.
   - GREEN: `1 passed`, `52 skipped`.
6. Tabs/recent renderer integration
   - RED: `npm test -- src/App.test.tsx`
   - Expected result: 4 failures for absent tab UI, all-tab dirty close,
     orientation layout, and recent UI.
   - GREEN: `1 passed`, `40 passed`.
7. Recency after warned saves
   - RED:
     `npm test -- src/App.test.tsx -t "committed save with a durability warning accurately"`
   - Expected result: recent listing called once instead of twice.
   - GREEN: `1 passed`, `39 skipped`.

## Final verification

- `npm test`
  - Exit 0
  - 22 test files passed
  - 266 tests passed
- `npm run typecheck`
  - Exit 0
  - Renderer and Node/Electron TypeScript projects passed
- `npm run build`
  - Exit 0
  - Typecheck, Vite renderer/main/preload builds, Electron packaging, and
    AppImage creation passed
  - Artifact: `release/2.1.0/Qingshu-2.1.0.AppImage`
- `git diff HEAD~3..HEAD --check`
  - Exit 0
- Packaged virtual-display smoke launch
  - Exit 0
  - Emitted DBus diagnostics in the headless environment

## Commits

- `20f319e` — `feat: persist and authorize recent files`
- `a1e2033` — `feat: add independent document tabs`
- `99336ba` — `fix: refresh recents after warned saves`

## Self-review

- Confirmed recent-open accepts only exact entries loaded and validated by
  Electron main; renderer-supplied arbitrary paths are rejected.
- Confirmed canonical paths unify symlink aliases for duplicate tabs and recent
  authorization.
- Confirmed stale save responses dispatch to their originating tab and cannot
  clear dirty state after a later edit/request.
- Confirmed missing recent files are removed both during listing and when they
  disappear between canonical validation and file open.
- Confirmed native close consults all tabs, not only the active document.
- Confirmed no framework or remote asset was introduced.

## Concerns

- The packaged app was smoke-launched headlessly, but interactive desktop
  clicking was not available. DOM integration tests cover multi-tab editing,
  switching, duplicate activation, close confirmation, both layouts, recent
  menus, palette commands, and native-close behavior.
- Vite reports the existing renderer bundle as larger than 500 kB after
  minification. Packaging still succeeds; code splitting was outside scope.
- The requested plan file remains an untracked user-provided file and was not
  committed.
- No push was performed, as explicitly requested.
