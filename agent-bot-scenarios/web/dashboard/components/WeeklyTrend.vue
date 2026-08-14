<script setup>
import { computed } from 'vue';

const props = defineProps({
  weeklyTrend: { type: Array, required: true }, // [[week, { teamName: count }], ...]
  teamNames: { type: Array, required: true },
});

const palette = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)', 'var(--chart-7)', 'var(--chart-8)'];
const colorFor = i => palette[i % palette.length];

const max = computed(() => props.weeklyTrend.reduce((m, [, teamMap]) => {
  const weekTotal = Object.values(teamMap).reduce((a, b) => a + b, 0);
  return Math.max(m, weekTotal);
}, 1));

function weekTotal(teamMap) {
  return Object.values(teamMap).reduce((a, b) => a + b, 0);
}

function widthPct(count) {
  return (count / max.value) * 100;
}
</script>

<template>
  <div class="legend">
    <span v-for="(t, i) in teamNames" :key="t" class="legend-item">
      <span class="swatch" :style="{ background: colorFor(i) }" />{{ t }}
    </span>
  </div>

  <table class="trend-table">
    <tbody>
      <tr v-if="!weeklyTrend.length">
        <td class="muted">Нет данных</td>
      </tr>
      <tr v-for="[week, teamMap] in weeklyTrend" :key="week">
        <td class="muted">{{ week }}</td>
        <td class="bar-cell">
          <div class="bar-track">
            <span
              v-for="(t, i) in teamNames"
              :key="t"
              v-show="teamMap[t]"
              class="bar-segment"
              :style="{ width: widthPct(teamMap[t] || 0) + '%', background: colorFor(i) }"
              :title="`${t}: ${teamMap[t] || 0}`"
            />
          </div>
        </td>
        <td class="num">{{ weekTotal(teamMap) }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.legend { margin-bottom: 8px; font-size: 12px; color: #475569; }
.legend-item { margin-right: 12px; white-space: nowrap; }
.swatch { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 4px; }
.bar-cell { width: 50%; }
.bar-track { display: flex; height: 14px; background: #f1f5f9; border-radius: 3px; overflow: hidden; }
.bar-segment { height: 100%; }
</style>
