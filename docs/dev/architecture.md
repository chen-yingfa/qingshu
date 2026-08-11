# Architecture

Qingshu is a React renderer hosted by an Electron main process. Vite bundles the
renderer, main process, and preload script; packaged applications contain only those
bundles and static renderer assets.

## Renderer

- `src/App.tsx` coordinates tabs, commands, settings, notifications, and close
  confirmation.
- `src/hooks/useDocument.ts` owns canonical Markdown document state and file
  workflows.
- `src/components/LiveEditor.tsx` edits source-backed blocks and delegates rendering
  to `src/markdown/`.
- `src/markdown/` parses, sanitizes, and renders GFM and math while applying
  CJK-aware transforms.

Markdown source is the document of record. Rendered HTML is derived, sanitized
output and is never written back as editor state.

## Electron

- `electron/main/index.ts` creates windows, owns native dialogs and filesystem
  operations, validates IPC senders, and coordinates window/application close.
- `electron/preload/index.ts` exposes the narrow typed `window.qingshu` bridge.
- `src/types/electron.d.ts` defines the renderer-facing bridge contract.

The renderer has no Node.js access. The BrowserWindow uses context isolation,
sandboxing, and `nodeIntegration: false`; privileged work crosses explicit IPC
channels implemented by the preload and main bundles.
