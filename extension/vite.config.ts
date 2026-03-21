import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: path.resolve(__dirname, 'src/popup/index.html'),
        'service-worker': path.resolve(__dirname, 'src/background/service-worker.ts'),
        whatsapp: path.resolve(__dirname, 'src/content-scripts/whatsapp.ts'),
        linkedin: path.resolve(__dirname, 'src/content-scripts/linkedin.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'service-worker') {
            return 'src/background/service-worker.js'
          }
          if (chunkInfo.name === 'whatsapp') {
            return 'src/content-scripts/whatsapp.js'
          }
          if (chunkInfo.name === 'linkedin') {
            return 'src/content-scripts/linkedin.js'
          }
          return 'assets/[name]-[hash].js'
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    },
  },
})
