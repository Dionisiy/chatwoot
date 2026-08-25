<script setup>
import { formatDate, formatDuration } from '../format';

defineProps({
  responseTimes: { type: Object, required: true },
});
</script>

<template>
  <p class="muted">
    За период {{ formatDate(responseTimes.range.since) }} —
    {{ formatDate(responseTimes.range.until) }}
    (данные — родные отчёты Chatwoot, с учётом рабочих часов).
  </p>
  <table class="table">
    <thead>
      <tr>
        <th>Категория</th>
        <th class="num">Диалогов</th>
        <th class="num">Ср. время ответа</th>
        <th class="num">Ср. время решения</th>
      </tr>
    </thead>
    <tbody>
      <tr class="total-row">
        <td>Всего по аккаунту</td>
        <td class="num">
          {{ responseTimes.overall.conversations_count ?? '—' }}
        </td>
        <td class="num">
          {{ formatDuration(responseTimes.overall.avg_first_response_time) }}
        </td>
        <td class="num">
          {{ formatDuration(responseTimes.overall.avg_resolution_time) }}
        </td>
      </tr>
      <tr v-if="!responseTimes.perCategory.length">
        <td colspan="4" class="muted">Нет диалогов с категориями за период</td>
      </tr>
      <tr v-for="c in responseTimes.perCategory" :key="c.name">
        <td>{{ c.name }}</td>
        <td class="num">{{ c.conversations_count ?? '—' }}</td>
        <td class="num">{{ formatDuration(c.avg_first_response_time) }}</td>
        <td class="num">{{ formatDuration(c.avg_resolution_time) }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.total-row td {
  font-weight: 600;
  color: var(--color-accent-300);
}
</style>
