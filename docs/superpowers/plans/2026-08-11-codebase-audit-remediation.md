# Codebase Audit Remediation Plan

## Renderer

- Commit source-mode native edits reliably.
- Ignore global shortcuts in non-editor controls.
- Preserve ephemeral empty/list editor state per tab.
- Remove duplicate settings/UI state and avoid resetting current mode from defaults.
- Reduce shell rerenders and repeated parse/normalization work.
- Correct palette ARIA IDs/pattern and extract focused LiveEditor modules.

## Markdown and CJK

- Prevent currency text from triggering math previews.
- Support remote Markdown images under CSP and print readiness.
- Apply configured CJK normalization in source mode.
- Share parser work; collapse repeated CJK transforms and drag/Enter parses.
- Sanitize after code/KaTeX mutations and show render errors.
- Remove dead highlighting logic and ignore IME Process keys.

## Electron and files

- Verify opened file identity after handle open to block symlink swaps.
- Cancel/serialize saves when tabs are discarded.
- Make exports atomic/private and cap IPC payloads.
- Serialize recents mutations/list delivery and clear all authorizations on navigation.
- Remove dead menu IPC and guard duplicate native dialogs.

## Build/repository

- Exclude bundled node_modules from packaged app.
- Remove dead Vue/assets/styles and stale docs.
- Update README limitations and environment metadata.
- Add CI, Dependabot, and clean script.
- Remove stale fixtures/agent report and duplicate icon binary.

## Verification

- Add focused red/green tests per issue.
- Run full test/typecheck/build, package Linux and Windows, inspect asar size,
  manually test GUI workflows, then run whole-branch review.
