# Settings and Hotkeys Plan

**Goal:** Make formatting and application shortcuts configurable, expose them in the command palette, and add persistent editor defaults.

1. Create a versioned settings model with safe local-storage loading, reset defaults, shortcut parsing, recording, matching, and platform display.
2. Route file, export, view, formatting, palette, and settings actions through the shortcut registry.
3. Add bold, italic, inline code, inline math, and settings commands to the palette; show every assigned shortcut at right.
4. Build an accessible settings dialog for theme, A4, CJK spacing, document font, font size, and every action shortcut.
5. Persist settings and apply them immediately.
6. Make the light workspace and paper uniformly white while preserving dark mode.
7. Add reducer/unit/DOM tests, visually verify keyboard recording and palette display, then run full packaging.
