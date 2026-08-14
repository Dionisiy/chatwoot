<script setup>
import { computed } from 'vue';
import { state, branchGroups, nodePreview, selectNode } from '../store';

const groups = computed(() => {
  const raw = branchGroups();
  const q = state.search.trim().toLowerCase();
  const result = [];
  Object.entries(raw).forEach(([key, ids]) => {
    const filtered = ids.filter(id => {
      if (!q) return true;
      const node = state.flows[id];
      return id.toLowerCase().includes(q) || nodePreview(node).toLowerCase().includes(q);
    });
    if (filtered.length) {
      result.push({ key, title: key === '__root__' ? 'Главное меню' : key, ids: filtered });
    }
  });
  return result;
});
</script>

<template>
  <div id="sidebar">
    <details v-for="g in groups" :key="g.key" open>
      <summary>{{ g.title }} ({{ g.ids.length }})</summary>
      <div
        v-for="id in g.ids"
        :key="id"
        class="node-item"
        :class="{ selected: id === state.selectedId }"
        @click="selectNode(id)"
      >
        <span class="tid">{{ id }}</span><br>
        {{ nodePreview(state.flows[id]).slice(0, 60) }}
      </div>
    </details>
  </div>
</template>

<style scoped>
#sidebar {
  width: 280px;
  overflow-y: auto;
  border-right: 1px solid var(--border);
  background: #fff;
  padding: 8px;
  flex-shrink: 0;
}
summary {
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  padding: 4px 2px;
  text-transform: uppercase;
}
.node-item {
  display: block;
  padding: 4px 8px;
  margin: 1px 0 1px 8px;
  border-radius: 5px;
  font-size: 12.5px;
  cursor: pointer;
  color: #334155;
  border-left: 3px solid transparent;
}
.node-item:hover { background: #f1f5f9; }
.node-item.selected { background: var(--accent-soft); border-left-color: var(--accent); color: #1d4ed8; font-weight: 600; }
.tid { font-family: ui-monospace, monospace; color: var(--muted-2); font-size: 11px; }
</style>
