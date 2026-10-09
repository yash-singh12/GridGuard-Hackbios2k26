import {defineConfig} from 'vite'; import react from '@vitejs/plugin-react'; import tailwindcss from '@tailwindcss/vite'
import path from 'path'
export default defineConfig({
  plugins:[react(),tailwindcss()],
  resolve: {
    alias: {
      'dompurify': path.resolve(__dirname, 'node_modules/dompurify/dist/purify.cjs.js'),
      'immer': path.resolve(__dirname, 'node_modules/immer/dist/cjs/index.js')
    }
  },
  server: {
    host: true,
    port: 5173
  },
  optimizeDeps: {
    exclude: ['html2canvas']
  }
})
