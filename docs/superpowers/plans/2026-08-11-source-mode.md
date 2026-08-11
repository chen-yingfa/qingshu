# Full-Document Source Mode Plan

**Goal:** Let users edit the canonical Markdown document directly in one source textarea.

1. Add failing App and LiveEditor tests for source-mode toggling, direct edits, round trips, Tab insertion, formatting, and rendered PDF precedence.
2. Add a full-document source editor that preserves caret/selection across parent acknowledgements.
3. Add source-mode state, toolbar control, command-palette entry, configurable shortcut, and persistent default.
4. Keep raw source monospace, responsive, IME-safe, and lightweight.
5. Ensure switching back reparses the edited source into live-preview blocks and exports remain rendered.
6. Run full tests, manual UI checks, review, and packaging.
