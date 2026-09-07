<script setup>
import { computed, toRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMapGetter } from 'dashboard/composables/store.js';
import GroupedAvatars from 'widget/components/GroupedAvatars.vue';
import AvailabilityText from './AvailabilityText.vue';
import { useAvailability } from 'widget/composables/useAvailability';

const props = defineProps({
  agents: {
    type: Array,
    default: () => [],
  },
  showHeader: {
    type: Boolean,
    default: true,
  },
  showAvatars: {
    type: Boolean,
    default: true,
  },
  textClasses: {
    type: String,
    default: '',
  },
});

const { t } = useI18n();

const availableMessage = useMapGetter('appConfig/getAvailableMessage');
const unavailableMessage = useMapGetter('appConfig/getUnavailableMessage');

// Pass toRef(props, 'agents') instead of props.agents to maintain reactivity
// when the parent component's agents prop updates (e.g., after API response)
const {
  currentTime,
  hasOnlineAgents,
  isOnline,
  inboxConfig,
  isInWorkingHours,
} = useAvailability(toRef(props, 'agents'));

const workingHours = computed(() => inboxConfig.value.workingHours || []);
const workingHoursEnabled = computed(
  () => inboxConfig.value.workingHoursEnabled || false
);
const utcOffset = computed(
  () => inboxConfig.value.utcOffset || inboxConfig.value.timezone || 'UTC'
);
const replyTime = computed(
  () => inboxConfig.value.replyTime || 'in_a_few_minutes'
);

// If online or in working hours
const isAvailable = computed(
  () => isOnline.value || (workingHoursEnabled.value && isInWorkingHours.value)
);

const headerText = computed(() =>
  isAvailable.value
    ? availableMessage.value || t('TEAM_AVAILABILITY.ONLINE')
    : unavailableMessage.value || t('TEAM_AVAILABILITY.OFFLINE')
);

// График работы показываем всегда, а не только когда поддержка офлайн.
// Апстримный AvailabilityText сообщает график лишь косвенно ("Мы будем
// доступны завтра в 10:00") и молчит, пока мы в сети, — клиент в рабочее
// время не знает, до скольки можно писать.
//
// В конфиге Chatwoot 0 — воскресенье; выводим с понедельника, как принято.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

// Индекс = dayOfWeek из конфига, как в AvailabilityText.vue#dayNames.
const shortDayNames = computed(() => [
  t('DAY_NAMES_SHORT.SUNDAY'),
  t('DAY_NAMES_SHORT.MONDAY'),
  t('DAY_NAMES_SHORT.TUESDAY'),
  t('DAY_NAMES_SHORT.WEDNESDAY'),
  t('DAY_NAMES_SHORT.THURSDAY'),
  t('DAY_NAMES_SHORT.FRIDAY'),
  t('DAY_NAMES_SHORT.SATURDAY'),
]);

const pad = value => String(value).padStart(2, '0');

const slotTime = slot => {
  if (slot.openAllDay) return t('WORKING_HOURS.ALL_DAY');
  return `${pad(slot.openHour || 0)}:${pad(slot.openMinutes || 0)}–${pad(
    slot.closeHour || 0
  )}:${pad(slot.closeMinutes || 0)}`;
};

// Подряд идущие дни с одинаковым временем схлопываем в диапазон, чтобы
// график читался одной строкой ("Пн–Вс 10:00–19:00"), а не семью.
const scheduleGroups = computed(() => {
  if (!workingHoursEnabled.value) return [];

  const byDay = new Map(workingHours.value.map(slot => [slot.dayOfWeek, slot]));
  const groups = [];

  WEEK_ORDER.forEach(day => {
    const slot = byDay.get(day);
    if (!slot || slot.closedAllDay) {
      groups.push(null); // разрыв: закрытый день не склеивает соседей
      return;
    }
    const time = slotTime(slot);
    const last = groups[groups.length - 1];
    if (last && last.time === time) {
      last.days.push(day);
    } else {
      groups.push({ time, days: [day] });
    }
  });

  return groups.filter(Boolean);
});

const scheduleText = computed(() => {
  const names = shortDayNames.value;
  return scheduleGroups.value
    .map(({ days, time }) => {
      const first = names[days[0]];
      const last = names[days[days.length - 1]];
      const dayLabel = days.length > 1 ? `${first}–${last}` : first;
      return `${dayLabel} ${time}`;
    })
    .join(', ');
});
</script>

<template>
  <div class="flex items-center justify-between gap-2">
    <div class="flex flex-col gap-1">
      <div v-if="showHeader" class="font-medium text-n-slate-12">
        {{ headerText }}
      </div>

      <AvailabilityText
        :time="currentTime"
        :utc-offset="utcOffset"
        :working-hours="workingHours"
        :working-hours-enabled="workingHoursEnabled"
        :has-online-agents="hasOnlineAgents"
        :reply-time="replyTime"
        :is-online="isOnline"
        :is-in-working-hours="isInWorkingHours"
        :class="textClasses"
        class="text-n-slate-11"
      />

      <div v-if="scheduleText" class="text-n-slate-11" :class="textClasses">
        {{ t('WORKING_HOURS.SUMMARY', { schedule: scheduleText }) }}
      </div>
    </div>

    <GroupedAvatars v-if="showAvatars && isOnline" :users="agents" />
  </div>
</template>
