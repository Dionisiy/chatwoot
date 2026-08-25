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
    c => c.name.toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q)
  );
});

const selected = computed(() => props.clients.find(c => c.id === selectedId.value) || null);

function select(client) {
  selectedId.value = selectedId.value === client.id ? null : client.id;
}
</script>

<template>
  <div class="search-row">
    <input v-model="query" type="search" placeholder="Поиск клиента по имени или email…" class="search" />
  </div>

  <div v-if="selected" class="client-card">
    <div class="client-card-title">
      {{ selected.name }}
      <span v-if="selected.email" class="muted">· {{ selected.email }}</span>
      — обращений за период: <strong>{{ selected.total }}</strong>
    </div>
    <ul class="client-card-breakdown">
      <li v-for="[cat, count] in Object.entries(selected.categories)" :key="cat">{{ cat }}: {{ count }}</li>
    </ul>
  </div>

  <table>
    <thead>
      <tr>
        <th>Клиент</th>
        <th v-for="c in categoryNames" :key="c">{{ c }}</th>
        <th>Всего</th>
        <th>Последняя заявка</th>
      </tr>
    </thead>
    <tbody>
      <tr v-if="!filtered.length">
        <td :colspan="categoryNames.length + 3" class="muted">Нет диалогов за выбранный период</td>
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
          <template v-if="c.email"><br><span class="muted">{{ c.email }}</span></template>
        </td>
        <td v-for="cat in categoryNames" :key="cat" class="num">{{ c.categories[cat] || '' }}</td>
        <td class="num total">{{ c.total }}</td>
        <td>{{ formatDate(c.lastTicketAt) }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.total { font-weight: 600; }
.search-row { margin-bottom: 12px; }
.search { font-size: 13px; padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; width: 280px; max-width: 100%; }
.client-row { cursor: pointer; }
.client-row.selected { background: var(--accent-soft); }
.client-card {
  background: var(--accent-soft);
  border: 1px solid var(--accent);
  border-radius: 6px;
  padding: 10px 14px;
  margin-bottom: 12px;
  font-size: 13px;
}
.client-card-title { margin-bottom: 6px; }
.client-card-breakdown { margin: 0; padding-left: 18px; }
</style>
