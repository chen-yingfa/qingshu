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

## Second review remediation

Status: DONE_WITH_CONCERNS

### Fixes delivered

- Ordinary Save on an untitled document now uses the same two-phase native
  selection, Electron canonicalization/authorization, live-tab collision
  preflight, and authorized write as Save As.
- `useDocument` maintains a synchronously reduced live tab ref plus canonical
  path owners and token-counted reservations. Save, Save As, normal Open, and
  Recent Open make atomic ownership decisions after IPC awaits. Reservations
  survive overlapping operations and are released in `finally`; successful
  current saves commit ownership.
- Tab lifetimes prevent a dialog result from writing after its originating tab
  was closed or reset. Simultaneous duplicate opens deduplicate before tab ID
  and revision allocation.
- A transient recent read failure leaves persistence state unknown. It cannot
  be mutated or written as an empty fallback, and a later list/operation
  retries loading.
- Recent warnings are queued rather than overwritten, consumed once by a list
  response, and rendered even when that response is stale for ordering.
- Malformed recent JSON becomes a known-safe empty state and is atomically
  rewritten. Recent directory-sync warnings are retained and reported instead
  of being discarded.
- Resetting the sole tab threads the configured default source mode through
  the close action.
- Only the active tab advertises `aria-controls`; its target tabpanel exists.
  Inactive tabs no longer reference nonexistent panels.

### TDD red/green evidence

1. Untitled Save and atomic ownership:
   - RED:
     `npm test -- src/hooks/useDocument.dom.test.tsx -t "ordinary Save|atomically reserves|simultaneous opens"`
     failed all three tests: ordinary Save skipped canonical selection, both
     overlapping saves reached the write bridge, and duplicate opens consumed
     `tab-3`.
   - GREEN: `3 passed`.
2. Post-await lifetime:
   - RED:
     `npm test -- src/hooks/useDocument.dom.test.tsx -t "originating tab closes"`
     reached the write bridge after the tab closed.
   - GREEN: `1 passed`.
3. Sole-tab source default:
   - RED:
     `npm test -- src/hooks/useDocument.dom.test.tsx -t "configured source mode"`
     restored `false` instead of the configured `true`.
   - GREEN: `1 passed`.
4. ARIA controls:
   - RED:
     `npm test -- src/components/TabStrip.test.tsx -t "accessible tablist"`
     found `aria-controls="document-panel-two"` on an inactive tab without a
     panel.
   - GREEN: complete TabStrip suite `2 passed`.
5. Unknown/malformed recent state and directory sync:
   - RED focused runs showed an EACCES fallback writing
     `["/notes/new.md"]`, malformed JSON receiving no rewrite, and a dropped
     directory-sync warning.
   - GREEN: all three focused runs passed; complete Electron suite passed.
6. Warning queue:
   - RED:
     `npm test -- electron/main/index.test.ts -t "queues each recent persistence warning"`
     returned only the second warning.
   - GREEN: `1 passed`, and the following list response contained no consumed
     warnings.
7. Stale notification delivery:
   - RED:
     `npm test -- src/App.test.tsx -t "consumable recent notifications"`
     lost both warning and missing-file notification with the stale ordering.
   - GREEN: `1 passed`; newest path ordering remained intact.

### Commits

- `a91b56f` — `fix: reserve live document paths atomically`
- `9df0a98` — `fix: preserve recent state and notifications`

### Verification

- `npm test`: exit 0; 23 files passed; 292 tests passed.
- `npm run typecheck`: exit 0.
- `npm run build`: exit 0; renderer, Electron main/preload, packaging, and
  AppImage generation passed.
- Artifact: `release/2.1.0/Qingshu-2.1.0.AppImage`.
- `APPIMAGE_EXTRACT_AND_RUN=1` Xvfb smoke launch: accepted exit 0/timeout
  condition; actual run exited 0 and emitted only headless DBus diagnostics.

### Concerns

- This host still lacks `libfuse.so.2`, so AppImage smoke testing uses
  AppImageKit's extraction fallback.
- Vite still reports the pre-existing renderer chunk-size warning.
- The user-provided plan remains untracked and untouched.
- No push was performed.

## Final review remediation

Status: DONE_WITH_CONCERNS

### Fixes delivered

- Normal Open and Recent Open now install or reuse one
  `AuthorizedDocument` before reading. Reads are enqueued on that document's
  existing `saveQueue`, update its revision in place, and never replace the
  authorization object.
- A deterministic Save A / duplicate Open / Save B interleaving proves that
  Open waits for Save A, reads Save A's committed content/revision, Save B
  remains behind that read, and Save B is the final disk content.
- The renderer regression proves that the duplicate Open response only
  activates the existing owner and cannot replace newer dirty buffer content
  or falsely mark it clean.
- Closing a real tab removes its lifetime entry. Resetting the sole tab
  removes the old generation and installs one fresh generation for the
  replacement, preserving stale-operation invalidation without accumulating
  closed-tab entries.
- Recent warnings are deduplicated and capped at the newest 10 distinct
  messages, preventing repeated read/unavailable failures from growing the
  queue without bound.

### TDD red/green evidence

1. Main-process queue interleaving:
   - RED: `npm test -- --run electron/main/index.test.ts` failed the new
     interleaving regression while duplicate Open replaced authorization
     during Save A; Save B used the detached object and revision consistency
     failed.
   - GREEN: the focused Electron suite passed all 63 tests.
2. Recent warning queue:
   - RED: the same initial focused run failed the warning bound/deduplication
     regression. The assertion was refined to exercise the queue operation
     independently of suite-global recent state before production code was
     changed.
   - GREEN: the focused Electron suite passed all 63 tests.
3. Renderer overlap:
   - The renderer already ignored duplicate-open content for an owned path;
     the new cross-layer regression was added after the main queue fix and
     passed all 14 hook DOM tests. No renderer behavior change was needed.

### Commit

- `477aeea` — `fix: serialize duplicate document opens`

### Verification

- `npm test -- --run electron/main/index.test.ts`: exit 0; 63 tests passed.
- `npm test -- --run src/hooks/useDocument.dom.test.tsx`: exit 0; 14 tests
  passed.
- `npm test`: exit 0; 23 files passed; 295 tests passed.
- `npm run typecheck`: exit 0.
- `npm run build`: exit 0; typecheck, renderer, Electron main/preload,
  packaging, and AppImage generation passed.
- Artifact: `release/2.1.0/Qingshu-2.1.0.AppImage`.

### Concerns

- Vite still reports the pre-existing renderer chunk over 500 kB.
- The user-provided plan remains untracked and untouched.
- No push was performed.
