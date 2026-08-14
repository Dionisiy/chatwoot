<script setup>
import { formatDate } from '../format';

defineProps({
  clients: { type: Array, required: true },
  teamNames: { type: Array, required: true },
});
</script>

<template>
  <table>
    <thead>
      <tr>
        <th>Клиент</th>
        <th v-for="t in teamNames" :key="t">{{ t }}</th>
        <th>Всего</th>
        <th>Последняя заявка</th>
      </tr>
    </thead>
    <tbody>
      <tr v-if="!clients.length">
        <td :colspan="teamNames.length + 3" class="muted">Нет диалогов</td>
      </tr>
      <tr v-for="c in clients" :key="c.id">
        <td>
          {{ c.name }}
          <template v-if="c.email"><br><span class="muted">{{ c.email }}</span></template>
        </td>
        <td v-for="t in teamNames" :key="t" class="num">{{ c.teams[t] || '' }}</td>
        <td class="num total">{{ c.total }}</td>
        <td>{{ formatDate(c.lastTicketAt) }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.total { font-weight: 600; }
</style>
