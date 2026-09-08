<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { saveWidgetLocale } from 'widget/helpers/localeStorage';

// Языки, которые реально собраны в бандл виджета (см. widget/i18n/index.js —
// мы намеренно оставили только эти три). Список из chatwootWebChannel
// пересекаем с ними: иначе можно выбрать язык, для которого нет словаря,
// и vue-i18n молча отдаст английский.
const BUNDLED = {
  ru: 'Рус',
  uk: 'Укр',
  en: 'Eng',
};

const { locale } = useI18n({ useScope: 'global' });

const languages = computed(() => {
  const enabled = window.chatwootWebChannel?.enabledLanguages || [];
  const codes = enabled.length
    ? enabled.map(lang => lang.iso_639_1_code)
    : Object.keys(BUNDLED);
  return codes
    .filter(code => BUNDLED[code])
    .map(code => ({ code, label: BUNDLED[code] }));
});

// Меняем язык — и запоминаем выбор: при следующем открытии виджета он должен
// остаться, а не сброситься обратно на локаль аккаунта (см. app.vue#mounted).
const select = code => {
  locale.value = code;
  saveWidgetLocale(code);
};
</script>

<template>
  <div
    class="flex justify-center gap-1"
    :class="{ hidden: languages.length < 2 }"
  >
    <button
      v-for="lang in languages"
      :key="lang.code"
      type="button"
      class="px-2.5 py-1 text-xs font-medium rounded-lg transition-colors"
      :class="
        locale === lang.code
          ? 'bg-n-slate-4 text-n-slate-12'
          : 'text-n-slate-10 hover:text-n-slate-12'
      "
      :aria-pressed="locale === lang.code"
      @click="select(lang.code)"
    >
      {{ lang.label }}
    </button>
  </div>
</template>
