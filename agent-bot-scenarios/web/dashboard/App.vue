<script setup>
import { ref } from 'vue';
import ClientsTable from './components/ClientsTable.vue';
import ResponseTimes from './components/ResponseTimes.vue';
import WeeklyTrend from './components/WeeklyTrend.vue';
import CategoryBreakdown from './components/CategoryBreakdown.vue';
import PeriodPicker from './components/PeriodPicker.vue';

const data = ref(null);
const loading = ref(true);
const error = ref(null);

async function load(range) {
  loading.value = true;
  error.value = null;
  try {
    const params = new URLSearchParams();
    if (range?.since) params.set('since', range.since);
    if (range?.until) params.set('until', range.until);
    // Без ведущего слэша — см. комментарий у app.get('/dashboard', ...) в
    // server.js (nginx-прокси /agent-bot/ + относительные пути).
    const qs = params.toString();
    const res = await fetch(qs ? `api/data?${qs}` : 'api/data');
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    data.value = body;
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

// PeriodPicker сам эмитит начальный диапазон при монтировании (watch с
// immediate: true) — отдельный onMounted(load) не нужен, первая загрузка
// пойдёт через @change.
let lastRange = null;
function onRangeChange(range) {
  lastRange = range;
  load(range);
}

function refresh() {
  load(lastRange);
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>Статистика заявок SlideEdu</h1>
      <p class="muted">
        Обращения бота по категориям, клиентам и времени ответа
      </p>
    </div>

    <PeriodPicker @change="onRangeChange" />

    <div v-if="loading" class="meta">Загрузка…</div>
    <div v-else-if="error" class="error">
      Не удалось собрать дашборд: {{ error }}
    </div>

    <template v-else-if="data">
      <div class="meta">
        <span>Сформировано: {{ data.generatedAt }}</span>
        <span
          >· Обращений за выбранный период: {{ data.totalConversations }}</span
        >
        <span v-if="data.truncated" class="warn">
          — выборка ограничена (очень много диалогов), см. MAX_PAGES в
          src/dashboard.js
        </span>
        <button class="btn btn-ghost" type="button" @click="refresh">
          обновить
        </button>
      </div>

      <section class="card elev-sm">
        <h2>Обращения по категориям и сабкатегориям</h2>
        <CategoryBreakdown :categories="data.categories" />
      </section>

      <section class="card elev-sm">
        <h2>Клиент × категория</h2>
        <ClientsTable
          :clients="data.clients"
          :category-names="data.categoryNames"
        />
      </section>

      <section class="card elev-sm">
        <h2>Среднее время ответа и решения</h2>
        <ResponseTimes :response-times="data.responseTimes" />
      </section>

      <section class="card elev-sm">
        <h2>Тренд заявок по неделям (по категориям)</h2>
        <WeeklyTrend
          :weekly-trend="data.weeklyTrend"
          :category-names="data.categoryNames"
        />
      </section>
    </template>
  </div>
</template>

<style scoped>
.meta {
  margin-bottom: var(--space-6);
}
.meta .btn {
  margin-left: auto;
}
</style>
