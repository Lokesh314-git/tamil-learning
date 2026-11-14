import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Use root '/' by default for Render / custom domains, or VITE_BASE_PATH if specified
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      includeAssets: ['icon.png'],
      manifest: {
        name: 'Tamil Learning App',
        short_name: 'Tamil App',
        description: 'An interactive web app for learning Tamil.',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'icon.png',
            sizes: 'any',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('xlsx')) {
              return 'vendor-xlsx';
            }
            if (id.includes('firebase')) {
              return 'vendor-firebase';
            }
          }
        }
      }
    }
  },
  server: {
    port: 5173
  }
});
