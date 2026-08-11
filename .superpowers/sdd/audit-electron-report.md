# Electron/File Remediation Audit

## Status

Implemented the requested Electron and filesystem remediation batch on
`cursor/codebase-simplification-5ed7`. No commit was amended and no branch was
pushed.

## Changes

- Opening now captures the canonical target revision, opens a handle, requires a
  regular file, compares handle `dev`/`ino` and full revision data, and repeats
  canonical/name checks around the read. Dialog, recent-file, and duplicate-open
  paths share this flow.
- Renderer saves carry per-tab tokens. Closing a tab or confirming native
  close/quit cancels active tokens and waits for main-process save settlement.
  Main checks cancellation immediately before rename; if rename has already
  started, cancellation waits for it before discard is acknowledged.
- Markdown conflict detection now verifies an existing target through an open
  handle and holds that handle through rename. Missing/new targets still fail
  conservatively if a file appears.
- HTML and PDF exports use adjacent exclusive temp files, mode `0600`, file
  `fsync`, rename, directory `fsync`, and failure cleanup. Reveal grants are
  recorded only after a committed export is re-verified.
- Markdown save and HTML export text payloads are capped at 16 MiB measured as
  UTF-8 bytes, with channel-specific errors.
- Recent-file mutations and list/notification consumption share one state
  queue, preserving concurrent entries and warnings.
- Main-frame navigation clears document authorizations and export grants and
  cancels active save operations.
- One native file dialog per renderer is allowed at a time.
- Dead `qingshu:menu-command` preload/API wiring was removed; renderer tests now
  invoke the real command-palette path.
- README now states that New/Open preserve dirty documents in tabs and that
  confirmation applies when dirty tabs/windows are closed.

## TDD Evidence

- Initial focused run: 12 expected failures covering identity swaps, non-regular
  opens, save cancellation, target-handle conflicts, atomic export, payload
  limits, navigation authorization, dialog stacking, recent ordering, and
  renderer discard coordination.
- Commit-phase interleaving was added separately and failed because cancellation
  returned while rename was pending. The save-operation completion barrier made
  it pass.
- Focused green run: 142 tests passed across Electron main, document hook, App,
  and App render suites.
- Real-filesystem tests cover external replacement conflict rejection, private
  atomic HTML commit, and temp cleanup after a rejected target.

## Commits

- `3220720` test: cover Electron file remediation races
- `4c2481c` fix: harden Electron file operations
- `f9381b5` fix: cancel saves before discarding tabs
- `889972c` docs: correct multi-tab dirty document behavior
- `7cfab13` test: verify atomic file commits on real filesystem
- `83a844f` test: require discard to await committing saves
- `1804819` fix: await save settlement before discard

## Final Verification

- `npm test` — passed: 28 files, 343 tests.
- `npm run typecheck` — passed both renderer and Node TypeScript projects.
- `npm run build` — passed Vite renderer/main/preload builds, Electron Linux
  packaging, and AppImage generation.

Build output retained pre-existing warnings about the renderer chunk exceeding
500 kB and duplicate dependency references during packaging.

## Remaining Portability Boundary

Portable Node APIs do not expose a cross-platform conditional rename that means
“replace this path only if it still names this exact inode.” The implementation
therefore holds and verifies the target handle, rechecks the pathname, and fails
conservatively, but an external actor can still race the final verification and
the `rename()` system call. The same unavoidable final-check/use boundary exists
when returning an opened pathname after handle-bound validation. The code does
not claim stronger guarantees than Node can provide.

The pre-existing untracked
`docs/superpowers/plans/2026-08-11-codebase-audit-remediation.md` was left
untouched.
