# Block Drag Reorder Plan

**Goal:** Reorder Markdown blocks with a left gutter handle and visible drop boundaries without losing source formatting.

1. Add pure-function tests for moving first, middle, and last blocks while preserving exact separators and line endings.
2. Add DOM tests for drag start, translucent active drop indicator, drop, cancellation, and Alt+Arrow movement.
3. Implement source-preserving reorder from parsed block ranges and separator slots.
4. Add drag handles only to concrete Markdown blocks; keep synthetic empty inputs stable.
5. Add blue drop zones between every concrete block and clear drag state on drop/end.
6. Style handles and indicators for light/dark themes and narrow layouts.
7. Run the full suite, typecheck, packaging build, and focused review.
