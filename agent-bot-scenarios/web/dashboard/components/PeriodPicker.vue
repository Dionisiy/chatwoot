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
    return {
      since: toUnix(customSince.value, false),
      until: toUnix(customUntil.value, true),
    };
  }
  const found = PRESETS.find(p => p.id === preset.value);
  const now = Math.floor(Date.now() / 1000);
  return { since: now - found.days * 24 * 60 * 60, until: now };
});

watch(range, r => emit('change', r), { immediate: true });
</script>

<template>
  <div class="period-picker">
    <div class="seg" role="radiogroup" aria-label="Период">
      <label v-for="p in PRESETS" :key="p.id" class="seg-opt">
        <input
          v-model="preset"
          type="radio"
          name="period-preset"
          :value="p.id"
        />
        {{ p.label }}
      </label>
    </div>

    <div v-if="preset === 'custom'" class="custom-range">
      <svg
        class="icon"
        width="14"
        height="14"
        viewBox="0 0 256 256"
        fill="currentColor"
      >
        <path
          d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,48v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48V48ZM208,208H48V96H208V208Z"
        />
      </svg>
      <label class="field-inline">с <input v-model="customSince" type="date" class="input" /></label>
      <label class="field-inline">по <input v-model="customUntil" type="date" class="input" /></label>
    </div>
  </div>
</template>

<style scoped>
.period-picker {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-6);
  flex-wrap: wrap;
}
.custom-range {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--color-accent);
}
.field-inline {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 12px;
  color: color-mix(in srgb, var(--color-text) 70%, transparent);
}
.field-inline .input {
  width: auto;
  min-height: 30px;
  padding: 4px 8px;
  font-size: 12px;
}
</style>
