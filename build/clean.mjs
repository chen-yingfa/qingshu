import { rm } from 'node:fs/promises'

await Promise.all(
  ['dist', 'dist-electron', 'release'].map(path =>
    rm(path, { force: true, recursive: true }),
  ),
)
