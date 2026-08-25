<script setup>
import AvailabilityContainer from 'widget/components/Availability/AvailabilityContainer.vue';

// Раньше здесь была ещё и кнопка "Начать/продолжить беседу", которая при
// наличии диалога вела прямо в него (в обход истории заявок). По просьбе
// заказчика убрали — на главном экране виджета это теперь чисто статус
// "онлайн/офлайн", а переход к диалогам сделан явными кнопками в Home.vue
// ("Мои заявки" / "Начать новую заявку"), чтобы у клиента не было
// неочевидного пути "тихо продолжить" старое обращение мимо истории.
defineProps({
  availableAgents: { type: Array, default: () => [] },
});
</script>

<template>
  <div
    class="flex flex-col gap-3 w-full shadow outline-1 outline outline-n-container rounded-xl bg-n-background dark:bg-n-solid-2 px-5 py-4"
  >
    <AvailabilityContainer :agents="availableAgents" show-header show-avatars />
  </div>
</template>
