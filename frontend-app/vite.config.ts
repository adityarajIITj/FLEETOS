import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      // Serve legacy HTML pages from the backend
      '/login.html': { target: 'http://localhost:3000' },
      '/driver.html': { target: 'http://localhost:3000' },
      '/tracking.html': { target: 'http://localhost:3000' },
      '/tester.html': { target: 'http://localhost:3000' },
    },
  },
  build: {
    outDir: 'dist',
  },
})
