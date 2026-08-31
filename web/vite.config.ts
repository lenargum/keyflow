import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    // Один origin на фронт и API — так CORS не нужен ни в деве, ни в проде.
    proxy: { '/api': 'http://localhost:3000' },
  },
});
