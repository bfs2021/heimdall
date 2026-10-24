/* eslint-disable no-undef */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = process.env.VITE_PROJECT_DIR || path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), dts({ include: 'src', exclude: ['**/*.test.ts', '**/*.test.tsx'] })],
  cacheDir: process.env.CI ? '/tmp/.vite' : undefined,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@tinkermonkey/heimdall-ui/css': path.resolve(__dirname, './src/tokens/tokens.css'),
      '@tinkermonkey/heimdall-ui': path.resolve(__dirname, './src/index.ts'),
    },
  },
  // Only scan the dev app's own entry. By default Vite crawls every .html file
  // in the repo (docs/, test-app/, design-reference/), and docs/ has its own
  // node_modules — so a bare `react` import could resolve to docs' copy and
  // bundle two Reacts, which crashes hooks ("Invalid hook call").
  optimizeDeps: {
    entries: ['index.html'],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'HeimdallUI',
      fileName: (format) => `index.${format === 'es' ? 'js' : 'cjs'}`,
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
        },
      },
    },
  },
})
