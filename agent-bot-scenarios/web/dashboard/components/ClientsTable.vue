<script setup>
import { ref, computed } from 'vue';
import { formatDate } from '../format';

const props = defineProps({
  clients: { type: Array, required: true },
  categoryNames: { type: Array, required: true },
});

const query = ref('');
const selectedId = ref(null);

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return props.clients;
  return props.clients.filter(
    c =>
      c.name.toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q)
  );
});

const selected = computed(
  () => props.clients.find(c => c.id === selectedId.value) || null
);

function select(client) {
  selectedId.value = selectedId.value === client.id ? null : client.id;
}
</script>

<template>
  <div class="search-row">
    <svg
      class="icon"
      width="14"
      height="14"
      viewBox="0 0 256 256"
      fill="currentColor"
    >
      <path
        d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z"
      />
    </svg>
    <input
      v-model="query"
      type="search"
      placeholder="Поиск клиента по имени или email…"
      class="input search"
    />
  </div>

  <div v-if="selected" class="card client-card elev-sm">
    <div class="client-card-title">
      {{ selected.name }}
      <span v-if="selected.email" class="muted">· {{ selected.email }}</span>
      — обращений за период:
      <strong class="accent-text">{{ selected.total }}</strong>
    </div>
    <div class="client-card-breakdown">
      <span v-for="[cat, count] in Object.entries(selected.categories)" :key="cat" class="tag tag-outline">{{ cat }}: {{ count }}</span>
    </div>
  </div>

  <table class="table">
    <thead>
      <tr>
        <th>Клиент</th>
        <th v-for="c in categoryNames" :key="c">{{ c }}</th>
        <th class="num">Всего</th>
        <th>Последняя заявка</th>
      </tr>
    </thead>
    <tbody>
      <tr v-if="!filtered.length">
        <td :colspan="categoryNames.length + 3" class="muted">
          Нет диалогов за выбранный период
        </td>
      </tr>
      <tr
        v-for="c in filtered"
        :key="c.id"
        class="client-row"
        :class="{ selected: c.id === selectedId }"
        @click="select(c)"
      >
        <td>
          {{ c.name }}
          <template v-if="c.email">
            <br /><span class="muted">{{ c.email }}</span>
          </template>
        </td>
        <td v-for="cat in categoryNames" :key="cat" class="num">
          {{ c.categories[cat] || '' }}
        </td>
        <td class="num total">{{ c.total }}</td>
        <td>{{ formatDate(c.lastTicketAt) }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.total {
  font-weight: 600;
}
.search-row {
  position: relative;
  margin-bottom: var(--space-4);
  display: flex;
  align-items: center;
}
.search-row .icon {
  position: absolute;
  left: 12px;
  color: color-mix(in srgb, var(--color-text) 45%, transparent);
  pointer-events: none;
}
.search {
  width: 320px;
  max-width: 100%;
  padding-left: 34px;
}
.client-row {
  cursor: pointer;
}
.client-row.selected td {
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
}
.client-card {
  border: 1px solid var(--color-accent);
  margin-bottom: var(--space-4);
  font-size: 13px;
}
.client-card-title {
  margin-bottom: var(--space-1);
}
.accent-text {
  color: var(--color-accent-300);
}
.client-card-breakdown {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
</style>
