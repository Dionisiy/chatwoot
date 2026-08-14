<script setup>
import { ref, onMounted } from 'vue';
import ClientsTable from './components/ClientsTable.vue';
import ResponseTimes from './components/ResponseTimes.vue';
import WeeklyTrend from './components/WeeklyTrend.vue';

const data = ref(null);
const loading = ref(true);
const error = ref(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const res = await fetch('/dashboard/api/data');
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    data.value = body;
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="page">
    <h1>Статистика заявок SlideEdu</h1>

    <div v-if="loading" class="meta">Загрузка…</div>
    <div v-else-if="error" class="error">
      Не удалось собрать дашборд: {{ error }}
    </div>

    <template v-else-if="data">
      <div class="meta">
        Сформировано: {{ data.generatedAt }} · Всего диалогов в выборке: {{ data.totalConversations }}
        <span v-if="data.truncated" class="warn">
          — выборка ограничена (очень много диалогов), см. MAX_PAGES в src/dashboard.js
        </span>
        · <button class="refresh" type="button" @click="load">обновить</button>
      </div>

      <section>
        <h2>Клиент × тема (все заявки за всё время)</h2>
        <ClientsTable :clients="data.clients" :team-names="data.teamNames" />
      </section>

      <section>
        <h2>Среднее время ответа и решения</h2>
        <ResponseTimes :response-times="data.responseTimes" />
      </section>

      <section>
        <h2>Тренд заявок по неделям (по темам)</h2>
        <WeeklyTrend :weekly-trend="data.weeklyTrend" :team-names="data.teamNames" />
      </section>
    </template>
  </div>
</template>

<style>
.page { padding: 24px 32px; }
h1 { font-size: 20px; margin: 0 0 4px; }
h2 { font-size: 15px; margin: 32px 0 12px; color: #334155; }
.meta { color: var(--muted); font-size: 13px; margin-bottom: 24px; }
.warn { color: #b45309; font-size: 12px; }
.error { color: #dc2626; font-size: 13px; }
section { background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 16px 20px; margin-bottom: 20px; }
button.refresh {
  font-size: 12px;
  color: var(--accent);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}
</style>
