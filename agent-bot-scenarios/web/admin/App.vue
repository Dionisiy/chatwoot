<script setup>
import { onMounted, onBeforeUnmount } from 'vue';
import { state, loadAll } from './store';
import Toolbar from './components/Toolbar.vue';
import Sidebar from './components/Sidebar.vue';
import Canvas from './components/Canvas.vue';
import EditPanel from './components/EditPanel.vue';
import HistoryPanel from './components/HistoryPanel.vue';

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

.layout {
  display: flex;
  height: calc(100vh - 49px);
}
</style>
