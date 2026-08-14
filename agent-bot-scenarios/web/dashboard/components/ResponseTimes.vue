<script setup>
import { formatDate, formatDuration } from '../format';

defineProps({
  responseTimes: { type: Object, required: true },
});
</script>

<template>
  <p class="muted">
    За период {{ formatDate(responseTimes.range.since) }} — {{ formatDate(responseTimes.range.until) }}
    (последние 90 дней; данные — родные отчёты Chatwoot, с учётом рабочих часов).
  </p>
  <table>
    <thead>
      <tr><th>Команда</th><th>Диалогов</th><th>Ср. время ответа</th><th>Ср. время решения</th></tr>
    </thead>
    <tbody>
      <tr class="total-row">
        <td>Всего по аккаунту</td>
        <td class="num">{{ responseTimes.overall.conversations_count ?? '—' }}</td>
        <td class="num">{{ formatDuration(responseTimes.overall.avg_first_response_time) }}</td>
        <td class="num">{{ formatDuration(responseTimes.overall.avg_resolution_time) }}</td>
      </tr>
      <tr v-if="!responseTimes.perTeam.length">
        <td colspan="4" class="muted">Команды не созданы</td>
      </tr>
      <tr v-for="t in responseTimes.perTeam" :key="t.name">
        <td>{{ t.name }}</td>
        <td class="num">{{ t.conversations_count ?? '—' }}</td>
        <td class="num">{{ formatDuration(t.avg_first_response_time) }}</td>
        <td class="num">{{ formatDuration(t.avg_resolution_time) }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.total-row { font-weight: 600; background: var(--bg); }
</style>
