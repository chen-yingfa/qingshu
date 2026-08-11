# Build and Repository Cleanup Audit

Date: 2026-08-11
Branch: `cursor/codebase-simplification-5ed7`

## Outcome

The renderer, Electron main process, and preload are bundled before packaging.
All renderer/runtime libraries therefore moved to `devDependencies`, and the
builder file set explicitly excludes `node_modules`. Linux and Windows packages
contain only the bundles, renderer assets, and package metadata.

The unused Vue prototype, legacy assets/styles/fonts, sample, root Markdown
fixtures, and seven tracked historical agent reports were removed. Developer
documentation now describes the React/Electron process boundary and current file
security model. CI and Dependabot configuration were added without lint
dependencies.

## Commits

- `996c426713b2e0f1b4285f17978fcfaf72c37db0` — remove obsolete prototype and
  repository artifacts
- `adc49d7d3607d8b7f021830d69981851376d7a3d` — package only bundled application
  assets
- `0d78c60d7d01fb6551cbda1eff59e80e90dc853f` — add CI and Dependabot
- `18e147027aead1652dd47dab342971fff9bb355f` — use a parser-safe package exclusion
  glob

No commit was amended and no branch was pushed.

## Before and After

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| `app.asar` bytes | 31,551,723 | 1,985,151 | -29,566,572 (-93.71%) |
| `app.asar` entries | 3,660 | 71 | -3,589 |
| `app.asar` `node_modules` entries | 3,588 | 0 | -3,588 |
| Tracked repository bytes | 5,806,849 | 3,680,206 before this report | -2,126,643 (-36.62%) |
| Tracked duplicate 1024px PNGs | 2 | 1 canonical source | -852,206 bytes |

The resulting AppImage is 129,545,526 bytes. Its Electron runtime dominates that
artifact; application content in the asar is 1.99 MB.

The asar module list is now:

- `dist-electron/main/index.js`
- `dist-electron/preload/index.js`
- `dist/index.html`, `dist/icon.png`, renderer JS/CSS, and bundled KaTeX fonts
- `package.json`

There is no `node_modules` directory in either inspected asar.

## Repository and Icon Cleanup

- Removed every tracked `.vue` file, `src/main.ts`, `src/assets/`, `src/samples/`,
  and the top-level legacy `styles/` tree.
- Removed the corresponding TypeScript `exclude` workaround.
- Removed unreferenced `test.md` and `test1.md`.
- Removed seven tracked `.superpowers/sdd` historical reports; this requested
  audit is the sole new tracked report.
- Kept `src/styles.css` and the package-owned KaTeX stylesheet/font imports used
  by the React build. The production output contains the app stylesheet and KaTeX
  font assets, and the math style regression suite passes.
- Kept `build/icon-source.png` as the canonical 1024px source. Linux packaging
  consumes it directly; prebuild deterministically generates `build/icon.ico`,
  `build/icon.icns`, and the distinct 256px `public/icon.png`. The redundant
  tracked `build/icon.png` copy is gone.
- Removed the stale package debug-port block and added the cross-platform
  `npm run clean` script for `dist/`, `dist-electron/`, and `release/`.

Searches over active source, configuration, README, and developer docs found no
references to the removed prototype paths, legacy style paths,
`nodeIntegration: true`, or port 3344.

## Verification

- `npm run clean && npm ci` — passed; exact lock install completed with 0
  vulnerabilities.
- `npm run typecheck` — passed both TypeScript projects.
- `npm test` — passed 28 files and 351 tests.
- `npm run build` — passed typecheck, renderer/main/preload production builds,
  Linux x64 packaging, and AppImage generation.
- `npx electron-builder --win --x64 --dir --publish never` — passed Windows x64
  unpacked packaging and executable asar-integrity update.
- Linux and Windows `app.asar` inspection — each is 1,985,151 bytes with 71
  entries and no `node_modules` path.
- Packaged Linux launch — an isolated packaged process loaded the local
  `file:///workspace/release/2.1.0/linux-unpacked/resources/app.asar/dist/index.html`
  page with title `Qingshu`, confirmed through its Chromium debugging endpoint.
- Generated icon test — rerunning `build/generate-icons.mjs` reproduced the
  checked-in ICO, ICNS, and runtime PNG byte-for-byte and did not recreate
  `build/icon.png`.

An initial full test run found that the test's simple comment stripper interpreted
the brace-expanded exclusion glob as comment syntax. Commit `18e1470` replaced it
with the equivalent `!node_modules/**` pattern; the complete suite was then rerun
and passed.

## Final Review Remediation

Five follow-up commits close the final renderer and Electron review findings:

- `2691eaf` — keep sole source-tab content revisions monotonic across reset.
- `aa2e4fa` — retain document/export grants for in-place fragment navigation.
- `ab308fb` — make tab and native all-tab close scopes atomic against edits and
  save starts while cancellation settles.
- `a219cd5` — serialize HTML and PDF commits through a shared canonical-path
  queue.
- `92f4dfa` — normalize only the active block using protected ranges cached from
  the existing document AST.

Focused regressions cover source reset plus subsequent input, footnote hash
navigation, tab/native-close interleavings, cross-renderer HTML/PDF queueing and
queue recovery, and bounded CJK parser/transform work with code and URL
protection. The final full verification above was rerun after these commits.

## Concerns

- Vite reports the existing renderer chunk-size advisory: the minified renderer
  JS is 765.69 kB (234.23 kB gzip).
- `npm ci` reports deprecation warnings in transitive packaging dependencies,
  while its audit reports 0 vulnerabilities.
- The Linux smoke environment has no session D-Bus, so Electron logged expected
  D-Bus connection warnings. The local packaged page still loaded.
- Windows was package-verified but not launched on Linux. macOS packaging remains
  unavailable on this Linux agent.
