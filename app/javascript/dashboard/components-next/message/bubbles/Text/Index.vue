<script setup>
import { computed, ref } from 'vue';
import BaseBubble from 'next/message/bubbles/Base.vue';
import FormattedContent from './FormattedContent.vue';
import AttachmentChips from 'next/message/chips/AttachmentChips.vue';
import TranslationToggle from 'dashboard/components-next/message/TranslationToggle.vue';
import { useMessageContext } from '../../provider.js';
import { useTranslations } from 'dashboard/composables/useTranslations';

const { content, attachments, contentAttributes } = useMessageContext();

const { hasTranslations, translationContent } =
  useTranslations(contentAttributes);

const renderOriginal = ref(false);

const renderContent = computed(() => {
  if (renderOriginal.value) {
    return content.value;
  }

  if (hasTranslations.value) {
    return translationContent.value;
  }

  return content.value;
});

const isEmpty = computed(() => {
  return !content.value && !attachments.value?.length;
});

const handleSeeOriginal = () => {
  renderOriginal.value = !renderOriginal.value;
};
</script>

<template>
  <BaseBubble class="px-4 py-3" data-bubble-name="text">
    <div class="gap-3 flex flex-col">
      <span v-if="isEmpty" class="text-n-slate-11">
        {{ $t('CONVERSATION.NO_CONTENT') }}
      </span>
      <FormattedContent v-if="renderContent" :content="renderContent" />
      <TranslationToggle
        v-if="hasTranslations"
        class="-mt-3"
        :showing-original="renderOriginal"
        @toggle="handleSeeOriginal"
      />
      <AttachmentChips :attachments="attachments" class="gap-2" />
      <!-- Почта, которую клиент ввёл в ответ на вопрос с полем email.
           Раньше показывалась только у message_type "template" — а бот-сценарий
           шлёт свои вопросы обычным исходящим, и введённый адрес не попадал в
           ленту вовсе: оператор видел вопрос и следом ответ на СЛЕДУЮЩИЙ
           вопрос, без почты между ними. Условие по типу убрано: submittedEmail
           есть только у сообщений с content_type input_email, так что для
           остальных ветка всё равно не отрисуется. -->
      <div
        v-if="contentAttributes.submittedEmail"
        class="px-2 py-1 rounded-lg bg-n-alpha-3"
      >
        {{ contentAttributes.submittedEmail }}
      </div>
    </div>
  </BaseBubble>
</template>

<style>
p:last-child {
  margin-bottom: 0;
}
</style>
