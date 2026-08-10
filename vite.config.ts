import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: {
          'main/index': 'electron/main/index.ts',
        },
      },
      preload: {
        input: {
          'preload/index': 'electron/preload/index.ts',
        },
      },
    }),
  ],
  clearScreen: false,
})
