# File and navigation security

The sandboxed renderer requests file operations through `window.qingshu`; it never
receives Node.js or Electron primitives. The preload exposes only typed operations
needed by the UI, and the main process rejects IPC from untrusted or navigated
senders.

Open and Save As choices establish main-process authorization for canonical physical
paths. Saves are serialized per target and compare file identity and revision before
replacement. Writes and exports use private adjacent temporary files, sync file data,
rename atomically, sync the parent directory where supported, and clean up on
failure. Payload limits and regular-file checks constrain renderer-controlled input.

Navigation and new-window requests are denied unless explicitly handled, and
navigation clears file/export grants and active save operations. The Content
Security Policy permits only local application code and the narrowly required image
schemes; rendered Markdown passes through an allowlist sanitizer before insertion.
