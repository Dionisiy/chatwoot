<script setup>
import { ref, computed, watch } from 'vue';

const emit = defineEmits(['change']);

const PRESETS = [
  { id: '7', label: '7 дней', days: 7 },
  { id: '30', label: '30 дней', days: 30 },
  { id: '90', label: '90 дней', days: 90 },
  { id: 'all', label: 'Весь период', days: null },
  { id: 'custom', label: 'Свой период', days: undefined },
];

const preset = ref('30');
const customSince = ref('');
const customUntil = ref('');

// Дата из <input type="date"> — календарный день в UTC, без учёта локального
// часового пояса браузера (для отчётов Chatwoot этого достаточно, секунды
// точности тут не важны).
function toUnix(dateStr, endOfDay) {
  if (!dateStr) return undefined;
  const time = endOfDay ? '23:59:59' : '00:00:00';
  return Math.floor(new Date(`${dateStr}T${time}Z`).getTime() / 1000);
}

const range = computed(() => {
  if (preset.value === 'all') return { since: undefined, until: undefined };
  if (preset.value === 'custom') {
    return { since: toUnix(customSince.value, false), until: toUnix(customUntil.value, true) };
  }
  const found = PRESETS.find(p => p.id === preset.value);
  const now = Math.floor(Date.now() / 1000);
  return { since: now - found.days * 24 * 60 * 60, until: now };
});

watch(range, r => emit('change', r), { immediate: true });
</script>

<template>
  <div class="period-picker">
    <button
      v-for="p in PRESETS"
      :key="p.id"
      type="button"
      class="chip"
      :class="{ active: preset === p.id }"
      @click="preset = p.id"
    >
      {{ p.label }}
    </button>

    <template v-if="preset === 'custom'">
      <label>с <input v-model="customSince" type="date" /></label>
      <label>по <input v-model="customUntil" type="date" /></label>
    </template>
  </div>
</template>

<style scoped>
.period-picker { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
.chip {
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: #fff;
  cursor: pointer;
  color: var(--muted);
}
.chip.active { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); font-weight: 600; }
label { font-size: 12px; color: var(--muted); display: inline-flex; align-items: center; gap: 4px; }
input[type='date'] { font-size: 12px; padding: 3px 6px; border: 1px solid var(--border); border-radius: 4px; }
</style>
