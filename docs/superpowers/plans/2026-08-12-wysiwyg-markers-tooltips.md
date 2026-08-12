# WYSIWYG Markers and Toolbar Tooltips

**Goal:** Keep Markdown markers canonical while hiding them from active list/quote textareas and rendering their visual structure immediately.

1. Add a marker-aware projection between canonical block source and visible textarea text, with bidirectional caret/selection mapping.
2. For list items, show one rendered bullet/number/task marker and edit only item text plus nested children.
3. For blockquotes, typing `> ` immediately shows the quote rail and edits quote text without showing the marker.
4. Preserve Enter/Tab/Backspace/undo, CRLF, IME, tabs, source mode, drag, and exact save/export round trips.
5. Add accessible styled hover/focus tooltips to every toolbar button, including recent files and view/settings controls.
6. Run full tests, manual UI checks, review, and packaging.
