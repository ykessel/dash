import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  // The API only allows APP_URL (http://localhost:5173) through CORS, so a fallback port would break login.
  server: { port: 5173, strictPort: true },
})
