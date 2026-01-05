// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
   ],
  server: {
    port: 3000,
    strictPort: true,
    allowedHosts: [
      'social-distance.com',
      '.social-distance.com' // The dot allows all subdomains too
    ],
    proxy: {
      // This redirects all socket traffic to the server
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
      },
      // This redirects all /api calls to the server
      '/api': 'http://localhost:3001',
    },
  },
})
