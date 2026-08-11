# Tabs and Recent Files Plan

**Goal:** Edit multiple independent Markdown files with horizontal or vertical tabs and securely reopen persisted recent files.

1. Replace single-document hook state with a tested tab reducer while preserving the active-document API used by App.
2. New/Open create tabs; duplicate paths activate existing tabs; each tab retains content, dirty state, active block, path, and revision.
3. Add accessible tab strip with close buttons, dirty indicators, keyboard switching, and horizontal/vertical layouts.
4. Persist tab orientation in Settings and apply layout responsively.
5. Persist recent canonical files in Electron main under user data; expose list/open IPC and authorize only stored entries.
6. Add recent-file command-palette entries and a toolbar menu.
7. Confirm dirty tabs before close/app quit, preserve save races, and test failures/missing recent files.
8. Run full tests, manual multi-tab checks, security review, and packaging.
