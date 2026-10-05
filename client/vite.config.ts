import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    rollupOptions: {
      // tg.html — мини-приложение Telegram: своя лёгкая страница, общий код с основным приложением
      input: { main: fileURLToPath(new URL('./index.html', import.meta.url)), tg: fileURLToPath(new URL('./tg.html', import.meta.url)) },
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3001' },
  },
})
