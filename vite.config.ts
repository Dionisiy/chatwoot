import { defineConfig } from 'vite';
import ruby from 'vite-plugin-ruby';
import vue from '@vitejs/plugin-vue';
import { aliases, vueOptions } from './vite.shared';
import yaml from '@rollup/plugin-yaml';

export default defineConfig({
  plugins: [ruby(), vue(vueOptions), yaml()],
  build: {
    // vite-plugin-ruby включает source maps по умолчанию, и в public/vite
    // оседало 59 файлов *.map на 22 МБ. Обычным пользователям они не нужны
    // (браузер тянет их только с открытым девтулзом), но они публично
    // доступны — то есть отдают исходники наружу — и удлиняют каждую сборку.
    // Для отладки прода их можно временно вернуть, поменяв на true.
    sourcemap: false,
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
      },
    },
  },
  resolve: { alias: aliases },
});
