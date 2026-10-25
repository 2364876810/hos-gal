// vite.config.js — 现有项目直接加 Vite，不用重构目录
import { defineConfig } from 'vite'
import react from "@vitejs/plugin-react";

export default defineConfig({
  // 项目是单页静态站，没有前端路由。关掉 SPA 回退，否则访问
  // /角色素材/ 这类目录会被偷偷返回 index.html，角色扫描逻辑就拿不到目录清单。
  plugins: [react()],
  appType: 'mpa',
  server: {
    host: '127.0.0.1',
    port: 5173,
    open: true,
    // 前端里的 fetch('/api/chat') 保持不变，由 Vite 转发给 Python 后端
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})
