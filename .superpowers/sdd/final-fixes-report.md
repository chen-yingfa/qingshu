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

---

## Final Re-review Remediation

The latest re-review findings were checked against `f99ad18`; every finding was
valid:

- authorized records held a revision but no save queue, allowing two IPC saves to
  pass the same revision check and rename in completion order;
- Open used path `readFile` followed by path `stat`, and Save used path `stat`
  after rename, so content and recorded revisions were not bound to the same file
  generation;
- footnote ordinals came from a source regex, including Markdown-looking text
  which the parser classifies as code, escaped text, HTML, or front matter;
- active-block CJK transforms parsed only the textarea slice and therefore lost
  full-document front-matter context;
- `RenderedBlock` memoization ignored the captured index/callback;
- replacement mode was fixed at `0600` and the parent directory was not synced;
- LiveEditor parsed the complete source once for blocks and again for render
  context on every content revision.

No reasoned pushback was recorded.

### Save ordering, revisions, and durability

Main-process authorized document records now include a promise queue per renderer
and path. Every save joins that queue before conflict checking, writing, revision
replacement, or responding. A deterministic gate in
`electron/main/index.test.ts` blocks the first write, invokes a second save, and
proves the second cannot write or rename until the first completes; final write
order is `older`, then `newest`.

The renderer adds monotonically increasing save request IDs. Older success/error
responses return `superseded` and reducer actions require the current request ID
and content before clearing dirty state. This prevents an earlier successful IPC
response from presenting stale content as saved while a newer invocation remains
pending.

Open now uses one read-only file handle, compares fstat revisions before and after
the read, and binds the returned content to that handle revision. Atomic writes
preserve the prior permission bits, fsync and fstat the exact temporary handle,
rename it, then fsync the containing directory. The post-save authorized revision
comes from the written handle rather than a path stat. Known Windows directory
open/sync unsupported errors are tolerated while the directory handle is always
closed; unexpected errors still fail.

### Shared AST document model and editor behavior

`parseDocument` now creates blocks and render context from one Markdown AST.
Footnote ordinals are collected only from positioned `footnoteReference` nodes;
front-matter-positioned nodes are excluded explicitly. Tests cover fenced and
inline code, escaped syntax, HTML comments, and YAML front matter without bogus
IDs or backlink ordinals.

LiveEditor consumes the shared model once per content revision. A deterministic
spy test proves one parse per source revision, while the existing 160-block test
still proves zero extra inactive render calls after an active edit.

Active CJK normalization constructs the full candidate document and limits
transformation to the active source range. This preserves AST/front-matter and
presentation ranges while retaining active-block editing and IME behavior.
Realistic Marp and Slidev DOM fixtures verify metadata remains byte-for-byte
unchanged.

Memoized rendered blocks now receive the current index and one stable activation
callback; both are comparator inputs. Insertion and removal before an unchanged
block are covered before click activation.

### Re-review TDD evidence

- RED: focused save/reducer run reported 8 expected failures, including both
  writes entering concurrently, path-based Open, missing mode/directory sync, and
  absent save generations.
- GREEN: `electron/main/index.test.ts` plus `useDocument.test.ts`: 28/28 passed;
  focused typecheck passed.
- RED: focused Markdown/LiveEditor run reported 5 expected failures for missing
  AST model, stale activation index, duplicate parse API, and document-context
  metadata handling.
- GREEN: Markdown, CJK, LiveEditor DOM/unit suites: 44/44 passed.
- Additional removal-before-click regression: 15/15 LiveEditor DOM tests passed.

### Re-review commits

- `ae93955e9fa3fe9ab702a511f7d55da012c99ac4` — serialize saves, bind revisions
  to handles, preserve modes, sync directories, and guard renderer generations
- `e6b0ceb630289532dfbe42daafd4c8b1f26f613d` — derive block/render behavior from
  one AST model and fix CJK/activation regressions
- `b209802ef73a255ea1da2016d1fcb1f91bfe81f0` — add removal-before-click coverage

### Re-review exact-head verification

- `npm test`: 14 files, 111 tests passed.
- `npm run typecheck`: passed.
- `npx vite build`: renderer, main, and preload bundles built.
- Linux x64 AppImage packaging: passed.
- Windows x64 unpacked packaging: passed, including executable resource update.

No commits were amended and nothing was pushed.

### Remaining concerns

- Vite continues to emit the non-failing renderer chunk-size advisory (about
  658 kB minified).
- electron-builder continues to log duplicate dependency references while
  packaging the unified/remark graph; package creation succeeds.
- macOS DMG creation remains unavailable on this Linux agent.
