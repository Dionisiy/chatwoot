<script setup>
// Персональная статистика: по каждому оператору — сколько бесед закрыл,
// сколько вёл и сколько сообщений отправил. Клик по строке раскрывает
// закрытия по категориям и типам проблем. Закрытия не операторами (клиент,
// бот, система) — отдельным блоком ниже, чтобы итог сходился.
import { ref } from 'vue';

defineProps({
  // { operators: [{ id, name, resolved, conversations, messages,
  //   categories: [{ name, total, problemTypes: [[name, count]] }] }],
  //   others: [[label, count]] }
  report: { type: Object, required: true },
});

const expanded = ref(new Set());
function toggle(id) {
  const next = new Set(expanded.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expanded.value = next;
}
</script>

<template>
  <table class="table">
    <thead>
      <tr>
        <th>Оператор</th>
        <th class="num">Закрыл</th>
        <th class="num">Вёл бесед</th>
        <th class="num">Сообщений</th>
      </tr>
    </thead>
    <tbody>
      <template v-for="op in report.operators" :key="op.id">
        <tr
          class="operator-row"
          :class="{ clickable: op.resolved > 0 }"
          @click="op.resolved > 0 && toggle(op.id)"
        >
          <td>
            <span v-if="op.resolved > 0" class="chevron">
              {{ expanded.has(op.id) ? '▾' : '▸' }}
            </span>
            {{ op.name }}
          </td>
          <td class="num">
            <span
              class="tag"
              :class="op.resolved ? 'tag-accent' : 'tag-neutral'"
            >
              {{ op.resolved }}
            </span>
          </td>
          <td class="num">{{ op.conversations }}</td>
          <td class="num">{{ op.messages }}</td>
        </tr>
        <template v-if="expanded.has(op.id)">
          <template v-for="cat in op.categories" :key="`${op.id}-${cat.name}`">
            <tr class="category-row">
              <td class="indent-1">{{ cat.name }}</td>
              <td class="num">
                <span class="tag tag-neutral">{{ cat.total }}</span>
              </td>
              <td colspan="2" />
            </tr>
            <!-- Подметки (finance-fop…) — уточнение категории; у финансов
                 это единственная разбивка, типов проблем там нет. -->
            <tr
              v-for="[sub, count] in cat.subcategories"
              :key="`${op.id}-${cat.name}-sub-${sub}`"
            >
              <td class="indent-2">{{ sub }}</td>
              <td class="num">{{ count }}</td>
              <td colspan="2" />
            </tr>
            <tr
              v-for="[type, count] in cat.problemTypes"
              :key="`${op.id}-${cat.name}-${type}`"
            >
              <td class="indent-2 problem-type">{{ type }}</td>
              <td class="num muted">{{ count }}</td>
              <td colspan="2" />
            </tr>
          </template>
        </template>
      </template>

      <tr v-if="report.others.length" class="others-head">
        <td colspan="4" class="muted">Закрыто не оператором</td>
      </tr>
      <tr v-for="[label, count] in report.others" :key="label">
        <td class="indent-1">{{ label }}</td>
        <td class="num">
          <span class="tag tag-neutral">{{ count }}</span>
        </td>
        <td colspan="2" />
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.operator-row td {
  font-weight: 600;
}
.clickable {
  cursor: pointer;
}
.clickable:hover td {
  background: color-mix(in srgb, var(--color-text) 4%, transparent);
}
.chevron {
  display: inline-block;
  width: 1em;
  opacity: 0.6;
}
.indent-1 {
  padding-left: calc(var(--space-4) * 2);
}
.indent-2 {
  padding-left: calc(var(--space-4) * 3.5);
  color: color-mix(in srgb, var(--color-text) 60%, transparent);
}
.problem-type {
  font-style: italic;
}
.category-row td {
  font-weight: 500;
}
.others-head td {
  padding-top: var(--space-6);
}
</style>
