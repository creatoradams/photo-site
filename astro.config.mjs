import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://adamsphoto.net',
  output: 'static',
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/client/'),
    }),
  ],
  image: {
    service: { entrypoint: 'astro/assets/services/sharp' },
  },
  vite: {
    server: {
      proxy: {
        '/api': { target: 'http://localhost:8081', changeOrigin: true },
      },
    },
  },
});