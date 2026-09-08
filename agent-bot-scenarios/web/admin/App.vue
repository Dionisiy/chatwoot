<script setup>
import { onMounted, onBeforeUnmount } from 'vue';
import { state, loadAll } from './store';
import Toolbar from './components/Toolbar.vue';
import Sidebar from './components/Sidebar.vue';
import Canvas from './components/Canvas.vue';
import EditPanel from './components/EditPanel.vue';
import HistoryPanel from './components/HistoryPanel.vue';
import TranslationsPanel from './components/TranslationsPanel.vue';

onMounted(loadAll);

function beforeUnload(e) {
  if (state.dirty) {
    e.preventDefault();
    e.returnValue = '';
  }
}
window.addEventListener('beforeunload', beforeUnload);
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload));
</script>

<template>
  <div v-if="state.loading" class="loading">Загрузка…</div>
  <div v-else-if="state.loadError" class="load-error">
    Не удалось загрузить редактор: {{ state.loadError }}
  </div>
  <template v-else>
    <Toolbar />
    <div class="layout">
      <Sidebar />
      <Canvas />
      <EditPanel />
    </div>
    <HistoryPanel />
    <TranslationsPanel />
  </template>
</template>

<style>
.loading,
.load-error {
  padding: 40px;
  font-size: 14px;
  color: var(--muted);
}
.load-error {
  color: #dc2626;
}

/* Раньше высота считалась как 100vh минус ровно 49px — высота тулбара в одну
   строку. Теперь тулбар переносится по строкам на узких экранах (см.
   Toolbar.vue), и жёсткое число уводило бы низ схемы и панели узла за край.
   Отдаём остаток высоты флексом, чтобы раскладка не зависела от того,
   сколько строк занял тулбар. */
#app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.layout {
  display: flex;
  flex: 1;
  min-height: 0;
}
</style>
