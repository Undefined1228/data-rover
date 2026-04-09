import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  build: {
    outDir: resolve(__dirname, '../out/webview'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        connectionForm: resolve(__dirname, 'connectionForm/main.ts'),
        queryEditor: resolve(__dirname, 'queryEditor/main.ts'),
        dataViewer: resolve(__dirname, 'dataViewer/main.ts'),
        sessionMonitor: resolve(__dirname, 'sessionMonitor/main.ts'),
        erd: resolve(__dirname, 'erd/main.ts'),
        schemaManagement: resolve(__dirname, 'schemaManagement/main.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const name = assetInfo.names?.[0] ?? assetInfo.name ?? ''
          if (name.includes('disclose-version')) return 'tailwind[extname]'
          return '[name][extname]'
        },
      },
    },
  },
  resolve: {
    alias: {
      $shared: resolve(__dirname, 'shared'),
    },
  },
})
