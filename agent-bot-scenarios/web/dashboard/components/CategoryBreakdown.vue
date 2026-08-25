<script setup>
defineProps({
  // [{ name, total, subcategories: [[name, count], ...] }, ...]
  categories: { type: Array, required: true },
});
</script>

<template>
  <table class="table">
    <thead>
      <tr>
        <th>Категория / Сабкатегория</th>
        <th class="num">Обращений</th>
      </tr>
    </thead>
    <tbody>
      <tr v-if="!categories.length">
        <td colspan="2" class="muted">Нет данных за выбранный период</td>
      </tr>
      <template v-for="cat in categories" :key="cat.name">
        <tr class="category-row">
          <td>{{ cat.name }}</td>
          <td class="num">
            <span class="tag tag-accent">{{ cat.total }}</span>
          </td>
        </tr>
        <tr v-for="[sub, count] in cat.subcategories" :key="sub">
          <td class="sub-name">{{ sub }}</td>
          <td class="num">
            <span class="tag tag-neutral">{{ count }}</span>
          </td>
        </tr>
      </template>
    </tbody>
  </table>
</template>

<style scoped>
.category-row td {
  font-weight: 600;
}
.sub-name {
  padding-left: calc(var(--space-4) * 2);
  color: color-mix(in srgb, var(--color-text) 60%, transparent);
  font-weight: 400;
}
</style>
