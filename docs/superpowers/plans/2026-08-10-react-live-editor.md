# Qingshu React Live Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unfinished Vue prototype with a secure, lightweight React Markdown editor that delivers the README roadmap and strong CJK live-preview editing.

**Architecture:** Electron owns privileged file and export operations behind a typed preload bridge. React owns document state and renders source-backed top-level Markdown blocks, showing rendered output except for the active source block. Focused utility modules handle Markdown and CJK behavior independently.

**Tech Stack:** React, TypeScript, Vite, Electron, unified/remark/rehype, KaTeX, Vitest.

## Global Constraints

- Files remain ordinary UTF-8 Markdown with no proprietary metadata.
- The renderer has context isolation enabled and no Node integration.
- GFM, footnotes, inline/display LaTeX, HTML, PDF, A4 preview, command palette, and CJK shortcuts are supported.
- Runtime UI uses no component framework, state library, Monaco, or remote assets.

---

### Task 1: React build and secure desktop bridge

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `index.html`
- Modify: `electron/main/index.ts`
- Replace: `electron/preload/index.ts`
- Create: `src/types/electron.d.ts`
- Create: `src/main.tsx`

**Interfaces:**
- Produces: `window.qingshu` with `openFile`, `saveFile`, `exportHtml`, `exportPdf`, `windowAction`, and `onMenuCommand`.

- [ ] Replace Vue dependencies and plugins with current React, Vite, Electron, unified, sanitization, KaTeX, and Vitest packages using `npm install`.
- [ ] Add a typed preload contract:

```ts
type FileResult = { canceled: true } | { canceled: false; path: string; content?: string }
window.qingshu.openFile(): Promise<FileResult>
window.qingshu.saveFile(request: { path?: string; content: string }): Promise<FileResult>
```

- [ ] Implement IPC handlers with `fs/promises`, dialog cancellation, HTML writing, and `webContents.printToPDF`.
- [ ] Configure the window with `contextIsolation: true`, `nodeIntegration: false`, platform window controls, and close confirmation.
- [ ] Run `npm run typecheck`; expect no TypeScript errors.

### Task 2: Markdown and CJK core

**Files:**
- Create: `src/markdown/markdown.ts`
- Create: `src/markdown/cjk.ts`
- Create: `src/markdown/markdown.test.ts`
- Create: `src/markdown/cjk.test.ts`

**Interfaces:**
- Produces: `parseBlocks(source: string): MarkdownBlock[]`
- Produces: `renderMarkdown(source: string): Promise<string>`
- Produces: `normalizeCjkInput(source: string): string`
- Produces: `spaceCjkLatin(source: string): string`
- Produces: `documentStats(source: string): DocumentStats`

- [ ] Write failing tests asserting top-level block source preservation, GFM tables, task lists, footnotes, inline/display math, CJK shortcut conversion, code exclusion, spacing, and segmented counts.
- [ ] Run `npm test`; expect failures because modules are absent.
- [ ] Implement AST-position block extraction and a sanitized unified renderer.
- [ ] Implement composition-safe pure CJK transforms and `Intl.Segmenter` statistics.
- [ ] Run `npm test`; expect all core tests to pass.

### Task 3: Live-preview editor and application shell

**Files:**
- Create: `src/App.tsx`
- Create: `src/components/LiveEditor.tsx`
- Create: `src/components/TitleBar.tsx`
- Create: `src/components/Toolbar.tsx`
- Create: `src/components/StatusBar.tsx`
- Create: `src/components/Icons.tsx`
- Create: `src/hooks/useDocument.ts`
- Create: `src/styles.css`

**Interfaces:**
- Consumes: core functions and `window.qingshu`.
- Produces: source-backed document editing, file actions, view preferences, and export actions.

- [ ] Build a reducer-based document state with dirty, path, content, active block, and error status.
- [ ] Render inactive blocks as sanitized Markdown and the active block as an auto-height source textarea.
- [ ] Implement block navigation, blank-line splitting, start-of-block merging, IME-safe normalization, and CJK Ctrl+Arrow movement.
- [ ] Add New/Open/Save/Save As, theme, focus, A4, auto-spacing, and toolbar formatting commands.
- [ ] Add editorial responsive styling with local system fonts and complete light/dark colors.
- [ ] Run `npm run typecheck && npm test`; expect both to pass.

### Task 4: Command palette, exports, and lifecycle

**Files:**
- Create: `src/components/CommandPalette.tsx`
- Create: `src/components/Toast.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Modify: `README.md`

**Interfaces:**
- Consumes: an array of `{ id, label, shortcut, keywords, run }` commands.
- Produces: searchable keyboard command execution and visible operation feedback.

- [ ] Implement fuzzy command filtering, arrow selection, Enter execution, and Escape dismissal.
- [ ] Wire Ctrl+P, Ctrl+O, Ctrl+S, Ctrl+Shift+S, theme/focus/A4 commands, HTML export, and PDF export.
- [ ] Add dirty-close confirmation and success/error toasts.
- [ ] Update README setup, architecture, implemented features, shortcuts, and CJK behavior.
- [ ] Run `npm run build`; expect renderer, Electron bundles, and installer packaging to complete.

### Task 5: Visual and interaction verification

**Files:**
- Modify as needed: `src/**/*.tsx`, `src/styles.css`

**Interfaces:**
- Produces: verified desktop-quality behavior at narrow and wide layouts.

- [ ] Start the Vite application and inspect it in a browser.
- [ ] Verify the welcome document, editing transition, GFM table/task list, KaTeX, command palette, dark theme, A4 preview, focus mode, and CJK typography.
- [ ] Fix any visible overflow, contrast, keyboard, or rendering defects.
- [ ] Re-run `npm test && npm run typecheck && npm run build`; expect all commands to pass.
