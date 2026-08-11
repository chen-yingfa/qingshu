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

## Review remediation

Status: DONE_WITH_CONCERNS

### Fixes delivered

- Save As now uses a two-phase protocol: Electron canonically resolves and
  authorizes the native dialog selection without writing, the renderer rejects
  any path owned by another live tab, and only then is the authorized save
  issued. Both clean-owner and dirty-owner collisions preserve both buffers.
- Open/save success no longer depends on recent-file persistence. Read, atomic
  write, chmod, and cleanup failures are retained as non-blocking warnings;
  failed queued writes cannot poison later writes.
- Recent storage now uses a `0600` exclusive temporary file, file fsync,
  rename, final `0600` chmod, and directory sync. `ENOENT` and `ENOTDIR` are
  both missing-path outcomes, and cleanup compares the original stored array
  with the validated result.
- Tabs retain source mode and exact forward/backward editor selections. The
  active editor restores that state after tab remount without adopting another
  tab's draft state.
- Horizontal, vertical, mobile, and focus layouts explicitly pin title,
  toolbar, tab strip, workspace, and status rows.
- Renderer recent refreshes use monotonically increasing generations, so an
  older response cannot replace a newer ordering or emit stale warnings.
- Tabs expose tab/tabpanel ID linkage, roving focus, inactive close buttons
  outside the tab order, and focus restoration after close.
- The toolbar recent control implements a true keyboard menu with initial
  focus, wrapping Arrow navigation, Home/End, Escape focus restoration,
  menuitem roles, and outside dismissal.
- Sequential duplicate opens activate before allocating a tab ID or revision
  map entry.

### Review-fix TDD evidence

1. Save As collision:
   - RED main:
     `npm test -- electron/main/index.test.ts -t "already authorized by another tab"`
     resolved and wrote instead of rejecting.
   - Further architecture RED:
     `npm test -- electron/main/index.test.ts -t "canonically authorizes a Save As"`
     had no two-phase handler.
   - RED renderer:
     `npm test -- src/hooks/useDocument.dom.test.tsx -t "Save As collides"`
     did not perform pre-write live-tab collision checking.
   - GREEN: main `1 passed`; renderer `2 passed`.
2. Best-effort atomic recents:
   - RED read/queue:
     `npm test -- electron/main/index.test.ts -t "recents cannot be read"`
     rejected the successful open with `EACCES`.
   - RED atomic persistence:
     `npm test -- electron/main/index.test.ts -t "persists canonical recents"`
     made no exclusive temporary-file write.
   - RED invalid cleanup and missing parent:
     focused tests failed for the absent comparison helper and raw `ENOTDIR`.
   - GREEN: all four focused runs passed; full Electron suite passed.
3. Duplicate allocation:
   - RED:
     `npm test -- src/hooks/useDocument.dom.test.tsx -t "does not consume tab IDs"`
     produced `tab-4` instead of `tab-3`.
   - GREEN: `1 passed`.
4. Per-tab editor view:
   - RED:
     `npm test -- src/App.test.tsx -t "restores each tab source mode"`
     returned to the first tab in the second tab's source mode.
   - GREEN: `1 passed`.
5. Grid rows:
   - RED:
     `npm test -- src/appearance.test.ts -t "pins workspace rows"`
     found no explicit row assignments.
   - GREEN: `3 passed`; horizontal/vertical source/preview/focus integration
     regression: `2 passed`.
6. Tab accessibility:
   - RED: `npm test -- src/components/TabStrip.test.tsx` failed tabpanel
     linkage and close-focus assertions.
   - GREEN: `2 passed`; App tabpanel integration `1 passed`.
7. Recent keyboard menu:
   - RED: `npm test -- src/components/Toolbar.test.tsx` failed initial focus
     and outside-dismiss assertions.
   - GREEN: `2 passed`.
8. Recent generation ordering:
   - RED:
     `npm test -- src/App.test.tsx -t "ignores stale recent"` did not surface
     the persistence warning and allowed unordered completion.
   - GREEN: `1 passed`.

### Review-fix commits

- `e20547e` — `fix: reject save-as tab path collisions`
- `cb29182` — `fix: harden tabs and recent file workflows`

### Review-fix verification

- `npm test`: exit 0; 23 files passed; 282 tests passed.
- `npm run typecheck`: exit 0; renderer and Electron TypeScript projects
  passed.
- `npm run build`: exit 0; Vite renderer/main/preload builds, Electron
  packaging, and AppImage creation passed.
- Artifact: `release/2.1.0/Qingshu-2.1.0.AppImage`.
- Direct AppImage smoke launch could not start because this host lacks
  `libfuse.so.2`. `APPIMAGE_EXTRACT_AND_RUN=1` extraction fallback exited 0
  after launching under Xvfb; Electron emitted headless DBus diagnostics.

### Review-fix concerns

- The environment cannot mount AppImages directly without FUSE, so smoke
  verification used AppImageKit's extraction fallback.
- Vite continues to report the pre-existing renderer chunk over 500 kB.
- The user-provided plan file remains untracked and was not modified.
- No push was performed, as requested.
