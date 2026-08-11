# Math and Code Editing Enhancements Plan

**Goal:** Add correct KaTeX typography, live active-block math/code previews, selectable document fonts, and predictable block insertion.

**Architecture:** Keep the canonical textarea-backed Markdown model. Add a debounced active-block preview beneath the source only for math and fenced-code blocks. Use bundled KaTeX CSS/fonts and a selectively registered syntax highlighter, while block-gap synthesis represents editable empty blocks without proprietary source markers.

## Tasks

1. Add failing rendering tests for KaTeX visual markup and representative `\left`, `\frac`, `\mathbb`, and subscript expressions.
2. Add failing LiveEditor tests for active math preview, fenced-code detection, live highlighting, Tab indentation, indentation-preserving Enter, and Enter-at-end block insertion.
3. Add failing App tests for sans default, font selection, and persisted preference.
4. Restore local KaTeX CSS and visual HTML while preserving hidden accessible MathML.
5. Add focused active-block preview and lightweight selective syntax highlighting.
6. Synthesize empty editable blocks from extra blank-line gaps and insert one on Enter at a non-code block end.
7. Add sans/serif/monospace selector and document font classes.
8. Update README and run tests, typecheck, production packaging, and visual verification.
