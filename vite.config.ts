// see https://vite.dev/config/ and https://github.com/vitejs/vite-plugin-react
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative paths, so the same build works at / and under a GitHub Pages subpath (/<repo>/).
  base: './',
  server: { port: 5173 },
});
