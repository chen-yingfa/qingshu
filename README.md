# 轻书 Qingshu

Qingshu is a lightweight desktop Markdown editor focused on clean writing, live
preview, and practical CJK input. It is built with React, TypeScript, Vite, and
Electron. The active application does not use the legacy Vue sources still retained
in the repository.

## Features

- Source-backed block editing with sanitized live preview.
- GitHub Flavored Markdown: tables, task lists, strikethrough, autolinks, and
  footnotes.
- Inline and display mathematics rendered with KaTeX.
- Light/dark themes, distraction-free focus mode, and an A4 page preview.
- Markdown open/save/save-as through a sandboxed Electron preload bridge.
- Attractive A4 PDF export through Chromium.
- Complete UTF-8 HTML export with rendered GFM and accessible standards-based MathML;
  all styling is inlined and equations need no bundled or network fonts.
- Fuzzy, keyboard-accessible command palette and dismissible success/error toasts.
- Dirty-document confirmation for New, Open, native window close, and application
  quit.
- Local-only UI assets and no UI framework.

## CJK behavior

Qingshu understands Han, Hiragana, Katakana, and Hangul text. It uses
`Intl.Segmenter` where available for document statistics and Ctrl+Arrow word
movement. Input normalization converts paired `￥…￥` to `$…$`, paired `·…·` to
inline code, line-leading `》 ` to `> `, and straight quoted CJK text to curly quotes.
Normalization waits until IME composition ends and preserves the caret.

Automatic CJK spacing is opt-in from the toolbar or command palette. When enabled,
it inserts spaces at CJK/Latin-letter or CJK/digit boundaries as editing continues.
Normalization and spacing deliberately leave fenced/inline code, math, link/image
destinations, YAML/TOML front matter, HTML/comments, and Marp/Slidev presentation
directives and component blocks unchanged.

## Keyboard shortcuts

`Cmd` may replace `Ctrl` for file and palette shortcuts on macOS.

| Shortcut | Action |
| --- | --- |
| `Ctrl+P` | Open the command palette |
| `Ctrl+N` | New document |
| `Ctrl+O` | Open Markdown |
| `Ctrl+S` | Save |
| `Ctrl+Shift+S` | Save as |
| `Escape` | Close the command palette or leave focus mode |
| `↑` / `↓`, `Enter`, `Escape` | Navigate, run, or dismiss the palette |
| `Ctrl+←` / `Ctrl+→` | Move by CJK-aware word boundaries in the editor |

Theme, focus mode, A4 preview, automatic CJK spacing, HTML export, and PDF export are
available in the command palette. Formatting controls are also available in the
toolbar.

## Architecture

- `src/App.tsx` owns application commands, shortcuts, view state, notifications,
  exports, and the renderer side of the close handshake.
- `src/components/LiveEditor.tsx` maintains exact Markdown source while rendering
  inactive blocks through the shared sanitized Markdown pipeline.
- `src/hooks/useDocument.ts` owns the document reducer and open/save workflows.
- `src/markdown/` contains sanitized GFM/KaTeX-to-MathML rendering and CJK
  transforms/statistics.
- `electron/preload/` exposes the narrow typed `window.qingshu` API.
- `electron/main/` validates IPC senders, performs native file/print operations, and
  retains sole authority over window/application closing.

Rendered HTML is never used as document state. The Markdown source remains canonical.

## Setup and development

Requirements: Node.js 22.12 or newer and npm.

```sh
npm ci
npm run dev
```

Useful checks:

```sh
npm test
npm run typecheck
```

Create production renderer/main/preload bundles and a platform package:

```sh
npm run build
```

Artifacts are written under `release/<version>/`. The checked-in builder configuration
defines a Windows x64 NSIS installer and macOS DMG; electron-builder uses its platform
default where no explicit target is configured.

## Current limitations

- Qingshu edits one document/window at a time and has no autosave, tabs, workspace,
  plugin, or knowledge-base layer.
- Syntax highlighting, table manipulation, image importing/embedding, and
  Marp/Slidev-specific tooling are not implemented.
- HTML styling and MathML equations are self-contained, but images referenced by the
  Markdown remain referenced URLs or file paths rather than embedded data.
- PDF appearance relies on the host Chromium print engine and installed fallback CJK
  fonts.
- Native dialogs, printing, IME ordering, and window chrome can vary by operating
  system and benefit from packaged-app smoke testing.
