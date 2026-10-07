import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  resolve: { alias: { '@': path.resolve(root, 'src') } },
  plugins: [react()],
  server: { host: true, proxy: { '/api': 'http://localhost:3000' } },
  build: { chunkSizeWarningLimit: 1500 },
});
