<script setup>
// Поле «Тип проблемы» в панели беседы — выглядит как соседний «Приоритет»:
// кнопка с текущим значением и выпадающий список под ней.
import { useToggle } from '@vueuse/core';
import { OnClickOutside } from '@vueuse/components';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';
import Button from 'dashboard/components-next/button/Button.vue';
import ProblemTypePicker from './ProblemTypePicker.vue';

defineProps({
  conversation: {
    type: Object,
    required: true,
  },
});

const { t } = useI18n();
const [isOpen, toggle] = useToggle(false);
const close = () => toggle(false);

const onSelected = problemType => {
  close();
  useAlert(
    t('CONVERSATION.PROBLEM_TYPE.CHANGED', { name: problemType?.name || '' })
  );
};
</script>

<template>
  <OnClickOutside @trigger="close">
    <div class="relative w-full mb-2" @keyup.esc="close">
      <Button
        slate
        outline
        trailing-icon
        :icon="isOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        class="w-full !px-2"
        @click="() => toggle()"
      >
        <div class="flex items-center w-full min-w-0">
          <h4
            class="overflow-hidden text-sm whitespace-nowrap text-ellipsis"
            :class="
              conversation.problem_type ? 'text-n-slate-12' : 'text-n-slate-10'
            "
            :title="conversation.problem_type?.name"
          >
            {{
              conversation.problem_type?.name ||
              t('CONVERSATION.PROBLEM_TYPE.PLACEHOLDER')
            }}
          </h4>
        </div>
      </Button>
      <div
        v-if="isOpen"
        class="box-border top-[2.625rem] w-full border rounded-lg bg-n-alpha-3 backdrop-blur-[100px] absolute shadow-lg border-n-strong p-2 z-[9999]"
      >
        <ProblemTypePicker
          :conversation="conversation"
          autofocus
          @selected="onSelected"
        />
      </div>
    </div>
  </OnClickOutside>
</template>
