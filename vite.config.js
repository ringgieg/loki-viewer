import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 8080,
    proxy: {
      '/loki': {
        target: 'http://localhost:3100',
        changeOrigin: true,
        // Don't rewrite path - preserve /loki prefix
        // /loki/api/v1/... → http://localhost:3100/loki/api/v1/...
        ws: true  // Enable WebSocket proxying
      }
    }
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'examples/',
        '*.config.js',
        'test-tools.sh'
      ]
    }
  }
})
