<script setup>
import { computed } from 'vue';

const props = defineProps({
  weeklyTrend: { type: Array, required: true }, // [[week, { categoryName: count }], ...]
  categoryNames: { type: Array, required: true },
});

const palette = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
  'var(--chart-8)',
];
const colorFor = i => palette[i % palette.length];

function weekTotal(categoryMap) {
  return Object.values(categoryMap).reduce((a, b) => a + b, 0);
}

const max = computed(() =>
  props.weeklyTrend.reduce(
    (m, [, categoryMap]) => Math.max(m, weekTotal(categoryMap)),
    1
  )
);

function widthPct(count) {
  return (count / max.value) * 100;
}
</script>

<template>
  <div class="legend">
    <span v-for="(t, i) in categoryNames" :key="t" class="legend-item">
      <span class="swatch" :style="{ background: colorFor(i) }" />{{ t }}
    </span>
  </div>

  <table class="trend-table">
    <tbody>
      <tr v-if="!weeklyTrend.length">
        <td class="muted">Нет данных</td>
      </tr>
      <tr v-for="[week, categoryMap] in weeklyTrend" :key="week">
        <td class="muted week-cell">{{ week }}</td>
        <td class="bar-cell">
          <div class="bar-track">
            <span
              v-for="(t, i) in categoryNames"
              v-show="categoryMap[t]"
              :key="t"
              class="bar-segment"
              :style="{
                width: widthPct(categoryMap[t] || 0) + '%',
                background: colorFor(i),
              }"
              :title="`${t}: ${categoryMap[t] || 0}`"
            />
          </div>
        </td>
        <td class="num">{{ weekTotal(categoryMap) }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.legend {
  margin-bottom: var(--space-3);
  font-size: 12px;
  color: color-mix(in srgb, var(--color-text) 65%, transparent);
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}
.legend-item {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}
.swatch {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 2px;
  margin-right: 6px;
}
.trend-table {
  width: 100%;
  border-collapse: collapse;
}
.trend-table td {
  padding: 5px var(--space-2);
}
.week-cell {
  width: 110px;
  font-size: 12px;
  white-space: nowrap;
}
.bar-cell {
  width: 55%;
}
.bar-track {
  display: flex;
  height: 14px;
  background: var(--color-neutral-900);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.bar-segment {
  height: 100%;
}
</style>
