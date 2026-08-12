# Per-Item List Block Plan

**Goal:** Represent each top-level ordered/unordered/task list item as an independent editor block without changing saved Markdown or rendered list semantics.

1. Extend Markdown block metadata with list group/order/start/marker information.
2. Split only top-level list items; nested lists remain inside their parent item.
3. Preserve exact source offsets, whitespace, CRLF, loose-item content, and task markers.
4. Render item blocks with correct sequential ordered numbering and visually continuous list spacing.
5. Adapt Enter continuation, empty-item exit, Tab/ShiftTab, Backspace, drag reorder, undo, tabs, and active-boundary logic.
6. Reordering items preserves source separators and recalculates list metadata after parse.
7. Add tight/loose, ordered, zero-padded, task, nested, CRLF, drag, undo, and round-trip regressions.
8. Run full tests, manual UI checks, review, and packaging.
