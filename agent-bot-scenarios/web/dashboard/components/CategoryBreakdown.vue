<script setup>
defineProps({
  // [{ name, total, subcategories: [[name, count], ...] }, ...]
  categories: { type: Array, required: true },
});
</script>

<template>
  <table>
    <thead>
      <tr>
        <th>Категория / Сабкатегория</th>
        <th>Обращений</th>
      </tr>
    </thead>
    <tbody>
      <tr v-if="!categories.length">
        <td colspan="2" class="muted">Нет данных за выбранный период</td>
      </tr>
      <template v-for="cat in categories" :key="cat.name">
        <tr class="category-row">
          <td>{{ cat.name }}</td>
          <td class="num">{{ cat.total }}</td>
        </tr>
        <tr v-for="[sub, count] in cat.subcategories" :key="sub">
          <td class="sub-name">{{ sub }}</td>
          <td class="num">{{ count }}</td>
        </tr>
      </template>
    </tbody>
  </table>
</template>

<style scoped>
.category-row { background: var(--bg); font-weight: 600; }
.sub-name { padding-left: 28px; color: var(--muted); font-weight: 400; }
</style>
