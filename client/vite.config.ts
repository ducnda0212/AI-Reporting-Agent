import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // 127.0.0.1, not localhost: Node 17+ resolves localhost to ::1 while uvicorn listens on IPv4 only (ECONNREFUSED).
  server: { proxy: { '/api': 'http://127.0.0.1:8000' } },
  test: { environment: 'node' },
});
