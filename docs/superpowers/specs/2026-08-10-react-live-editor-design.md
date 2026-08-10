# Qingshu React Live Editor Design

## Product direction

Qingshu remains a small, file-first Windows Markdown editor. It does not add a
vault, proprietary document model, or cloud account. The application opens and
saves ordinary Markdown files and emphasizes polished CJK typography.

The interface follows a quiet editorial aesthetic: a compact custom title bar,
a centered paper-like writing canvas, restrained warm-neutral colors, and a
small status bar. All essential actions remain keyboard accessible.

## Editing model

The editor uses an Obsidian-style live-preview model. Markdown is parsed into
top-level blocks. Inactive blocks display their rendered result; clicking or
moving into a block reveals its Markdown source in an auto-sizing text area.
This gives direct source access where the caret is while the surrounding
document remains WYSIWYG.

Block source remains the canonical state, so opening, editing, saving, and
exporting never require a lossy HTML-to-Markdown conversion. Entering a blank
line splits a block; Backspace at the start merges with the previous block.
Rendered blocks support GFM tables, task lists, footnotes, fenced code, links,
and KaTeX inline/display equations.

## CJK behavior

The editor uses a CJK-first system font stack and typography tuned for Chinese,
Japanese, and Korean scripts. `Intl.Segmenter` supplies language-aware word
counts and Ctrl+Arrow boundaries where supported.

Outside IME composition, input normalization converts the README shortcuts:

- `》 ` at line start becomes `> `
- paired `￥` becomes `$`
- paired `·` becomes backticks
- straight quotes around CJK text become full-width Chinese quotation marks

An optional auto-spacing preference inserts spaces between Han characters and
Latin letters or digits. Code spans, code fences, and URLs are excluded.

## Application features

- Secure Electron preload bridge with context isolation; the renderer has no
  direct Node access.
- Open, New, Save, Save As, HTML export, and PDF export.
- Dirty-state indication and confirmation before destructive file replacement
  or window close.
- Command palette for all document, view, and export actions.
- Light, dark, and system themes plus a distraction-free focus mode.
- A4 preview mode so PDF layout is visible before export.
- Marp/Slidev-friendly source preservation: front matter, directives, and
  fenced components remain editable and are never rewritten.
- Status information for save state, block location, words, characters, and
  reading time.

## Architecture

- `electron/main`: owns windows, dialogs, filesystem access, HTML writing, and
  `webContents.printToPDF`.
- `electron/preload`: exposes a narrow typed `qingshu` API.
- `src/markdown`: parsing, block extraction, rendering, sanitization, CJK
  transformations, and statistics.
- `src/components`: title bar, toolbar, live editor, command palette, welcome
  state, and status bar.
- `src/App`: document state, commands, persistence, preferences, and lifecycle.

React state is local and explicit. No global state library or UI framework is
needed. Icons are lightweight inline SVG components. Rendering uses unified
with GFM, math, KaTeX, and sanitization.

## Error handling

Bridge calls return structured success/cancel/error results. Cancelled dialogs
are silent. Real failures appear in a dismissible toast and do not clear current
content. Export and save actions update status only after the main process
reports success.

## Verification

Unit tests cover block splitting/joining, CJK transformations, spacing,
segmentation, and Markdown rendering. A production build validates React,
TypeScript, Electron, and packaging integration. Manual browser checks cover
editing, command palette, themes, responsive layout, CJK rendering, GFM, and
KaTeX.
