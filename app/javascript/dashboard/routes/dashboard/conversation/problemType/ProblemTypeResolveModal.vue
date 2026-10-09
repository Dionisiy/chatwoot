<script setup>
// Окно, которое оператор видит вместо закрытия беседы, если тип проблемы
// не выбран. Выбор сразу сохраняется, после чего окно отдаёт событие
// selected — и ResolveAction продолжает закрытие тем же путём, что и без окна.
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Dialog from 'dashboard/components-next/dialog/Dialog.vue';
import ProblemTypePicker from './ProblemTypePicker.vue';

const emit = defineEmits(['selected']);

const { t } = useI18n();
const dialogRef = ref(null);
const conversation = ref(null);

const open = chat => {
  conversation.value = chat;
  dialogRef.value?.open();
};

const onSelected = problemType => {
  dialogRef.value?.close();
  emit('selected', problemType);
};

defineExpose({ open });
</script>

<template>
  <Dialog
    ref="dialogRef"
    width="md"
    :title="t('CONVERSATION.PROBLEM_TYPE.RESOLVE_MODAL.TITLE')"
    :description="t('CONVERSATION.PROBLEM_TYPE.RESOLVE_MODAL.DESCRIPTION')"
    :show-confirm-button="false"
    :cancel-button-label="t('CONVERSATION.PROBLEM_TYPE.RESOLVE_MODAL.CANCEL')"
  >
    <ProblemTypePicker
      v-if="conversation"
      :conversation="conversation"
      autofocus
      @selected="onSelected"
    />
  </Dialog>
</template>
