import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * 部署到 GitHub Pages 子路径时需要指定 base；
 * 本机开发（npm run dev / npm run build）不设置 GH_PAGES，保持根路径。
 */
const GH_PAGES_BASE = '/course-schedule/'
const base = process.env.GH_PAGES ? GH_PAGES_BASE : '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [`${base}favicon.svg`, `${base}icons/apple-touch-icon.png`],
      manifest: {
        name: '课程表',
        short_name: '课程表',
        description: '轻量个人课程表',
        lang: 'zh-CN',
        display: 'standalone',
        start_url: base,
        scope: base,
        theme_color: '#4f6bf6',
        background_color: '#f4f6fb',
        icons: [
          { src: `${base}icons/pwa-192x192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${base}icons/pwa-512x512.png`, sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
