import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1000 },
  server: {
    port: 5173,
    host: true,
    proxy: { '/ws': { target: 'ws://localhost:3001', ws: true } },
  },
});
