const { resolve } = require('path');
const { defineConfig } = require('vite');
const vue = require('@vitejs/plugin-vue');

// base: './' — принципиально: сервис проксируется на дроплете под путём
// /agent-bot/ (nginx location /agent-bot/ { proxy_pass http://127.0.0.1:8010/; }
// с обрезкой префикса), а сам Node ничего не знает об этом префиксе. С
// относительным base браузер резолвит ./assets/x.js относительно реального
// URL страницы (.../agent-bot/admin → .../agent-bot/assets/x.js), что после
// прохождения через nginx превращается обратно в /assets/x.js — как раз то,
// что раздаёт express.static в server.js. С абсолютным base ('/') ассеты
// вели бы на корень домена slideedu-preview.space, минуя прокси на бота.
module.exports = defineConfig({
  root: 'web',
  base: './',
  plugins: [vue()],
  // Без этого Vite ищет postcss.config.js вверх по дереву каталогов и
  // подхватывает конфиг основного Rails/Vue-приложения Chatwoot (с
  // postcss-import/tailwind) из корня монорепы — нам он не нужен и не
  // установлен для этого отдельного сервиса. Пустой инлайн-конфиг
  // отключает файловый поиск целиком.
  css: { postcss: {} },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        admin: resolve(__dirname, 'web/admin.html'),
        dashboard: resolve(__dirname, 'web/dashboard.html'),
      },
    },
  },
  server: {
    // Локальная разработка: `npm run dev:web` поднимает Vite на 5173,
    // API-запросы уходят на реально запущенный `npm run dev` (порт из .env,
    // по умолчанию 8000).
    proxy: {
      '/admin/api': 'http://localhost:8000',
      '/dashboard/api': 'http://localhost:8000',
    },
  },
});
