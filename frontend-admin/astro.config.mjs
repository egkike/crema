// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

const PORT = Number(process.env.PORT) || 4321;

// https://astro.build/config
export default defineConfig({
  output: 'static',
  integrations: [
    react(),
    tailwind()
  ],
  server: {
    port: PORT,
    host: true
  },
  devToolbar: {
    enabled: false
  }
});