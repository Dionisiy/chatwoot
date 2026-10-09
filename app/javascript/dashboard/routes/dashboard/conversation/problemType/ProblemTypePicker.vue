<script setup>
// Выбор типа проблемы для беседы: поиск, список вариантов главных меток
// беседы и создание нового варианта прямо отсюда. Используется и в панели
// беседы (ProblemTypeSelect), и в окне перед закрытием (ProblemTypeResolveModal).
//
// Тип сохраняется сразу при выборе; наружу уходит событие selected с
// сохранённым типом — вызывающий решает, что делать дальше (закрыть
// выпадающий список, продолжить закрытие беседы).
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useProblemTypes } from 'dashboard/composables/useProblemTypes';
import {
  rootLabelsOf,
  normalizeProblemName,
  matchesProblemQuery,
} from 'dashboard/helper/problemTypes';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import Spinner from 'shared/components/Spinner.vue';

const props = defineProps({
  conversation: {
    type: Object,
    required: true,
  },
  autofocus: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['selected']);

const { t } = useI18n();
const store = useStore();
const accountLabels = useMapGetter('labels/getLabels');
const { problemTypes, isFetching, fetchProblemTypes, createProblemType } =
  useProblemTypes();

const query = ref('');
const isSaving = ref(false);
const inputRef = ref(null);

// Метки из модуля conversationLabels обновляются сразу при правке в панели,
// conversation.labels — только после realtime-события.
// Геттер conversationLabels отдаёт [] и для «ещё не загружено», поэтому
// смотрим в state напрямую: undefined — берём метки из самой беседы.
const conversationLabels = computed(
  () =>
    store.state.conversationLabels.records[Number(props.conversation.id)] ??
    props.conversation.labels ??
    []
);

const roots = computed(() =>
  rootLabelsOf(
    conversationLabels.value,
    (accountLabels.value || []).map(label => label.title)
  )
);

const currentId = computed(() => props.conversation.problem_type?.id);

const groups = computed(() =>
  roots.value.map(root => ({
    root,
    items: problemTypes.value
      .filter(item => item.label_title === root)
      .filter(item => matchesProblemQuery(item.name, query.value))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }))
);

// Создать можно, только если в этой метке нет варианта с тем же названием
// с точностью до регистра, ё/е и пунктуации — иначе это был бы дубль.
// Похожие варианты при этом уже показаны выше, и оператор видит их до того,
// как нажмёт «Создать».
const createTargets = computed(() => {
  const normalized = normalizeProblemName(query.value);
  if (!normalized) return [];
  return roots.value.filter(
    root =>
      !problemTypes.value.some(
        item =>
          item.label_title === root &&
          normalizeProblemName(item.name) === normalized
      )
  );
});

const hasAnyItems = computed(() =>
  groups.value.some(group => group.items.length)
);

// Сброс доступен только у незакрытой беседы: закрытая без типа выпала бы
// из отчёта в «Не указано», хотя её разбирал оператор. Сменить тип у
// закрытой беседы можно — выбором другого варианта.
const canReset = computed(
  () => !!currentId.value && props.conversation.status !== 'resolved'
);

// problemType = null — сбросить тип.
const select = async problemType => {
  if (isSaving.value) return;
  isSaving.value = true;
  try {
    const saved = await store.dispatch('assignProblemType', {
      conversationId: props.conversation.id,
      problemTypeId: problemType?.id ?? null,
    });
    emit('selected', saved);
  } catch (error) {
    useAlert(t('CONVERSATION.PROBLEM_TYPE.SAVE_ERROR'));
  } finally {
    isSaving.value = false;
  }
};

const create = async root => {
  if (isSaving.value) return;
  isSaving.value = true;
  let created;
  try {
    created = await createProblemType({
      labelTitle: root,
      name: query.value,
    });
  } catch (error) {
    useAlert(t('CONVERSATION.PROBLEM_TYPE.CREATE_ERROR'));
    return;
  } finally {
    isSaving.value = false;
  }
  query.value = '';
  await select(created);
};

// Enter: единственный подходящий вариант — выбрать его; иначе, если можно
// создать ровно в одной метке, — создать.
const onEnter = () => {
  const items = groups.value.flatMap(group => group.items);
  if (items.length === 1) {
    select(items[0]);
  } else if (!items.length && createTargets.value.length === 1) {
    create(createTargets.value[0]);
  }
};

onMounted(() => {
  fetchProblemTypes();
  if (props.autofocus) inputRef.value?.focus();
});
</script>

<template>
  <div class="flex flex-col gap-2">
    <input
      ref="inputRef"
      v-model="query"
      type="text"
      class="w-full px-3 py-2 text-sm rounded-lg bg-n-alpha-black2 outline outline-1 outline-n-weak focus:outline-n-brand text-n-slate-12 placeholder:text-n-slate-10"
      :placeholder="t('CONVERSATION.PROBLEM_TYPE.SEARCH_PLACEHOLDER')"
      :disabled="isSaving"
      @keydown.enter.prevent="onEnter"
    />

    <div class="flex flex-col gap-2 overflow-y-auto max-h-64">
      <div v-for="group in groups" :key="group.root" class="flex flex-col">
        <div
          v-if="groups.length > 1"
          class="px-2 pt-1 pb-0.5 text-xs font-medium text-n-slate-10"
        >
          {{ group.root }}
        </div>
        <button
          v-for="item in group.items"
          :key="item.id"
          type="button"
          class="flex items-center justify-between gap-2 px-2 py-1.5 text-sm text-left rounded-md text-n-slate-12 hover:bg-n-alpha-2 disabled:opacity-50"
          :class="{ 'bg-n-alpha-2': item.id === currentId }"
          :disabled="isSaving"
          @click="select(item)"
        >
          <span class="truncate">{{ item.name }}</span>
          <Icon
            v-if="item.id === currentId"
            icon="i-lucide-check"
            class="flex-shrink-0 size-4 text-n-brand"
          />
        </button>
      </div>

      <div
        v-if="!hasAnyItems && !createTargets.length && !isFetching"
        class="px-2 py-1.5 text-sm text-n-slate-10"
      >
        {{
          query
            ? t('CONVERSATION.PROBLEM_TYPE.NO_RESULTS')
            : t('CONVERSATION.PROBLEM_TYPE.EMPTY_LIST')
        }}
      </div>

      <button
        v-for="root in createTargets"
        :key="`create-${root}`"
        type="button"
        class="flex items-center gap-2 px-2 py-1.5 text-sm text-left rounded-md text-n-brand hover:bg-n-alpha-2 disabled:opacity-50"
        :disabled="isSaving"
        @click="create(root)"
      >
        <Icon icon="i-lucide-plus" class="flex-shrink-0 size-4" />
        <span class="truncate">
          {{
            roots.length > 1
              ? t('CONVERSATION.PROBLEM_TYPE.CREATE_IN_LABEL', {
                  name: query.trim(),
                  label: root,
                })
              : t('CONVERSATION.PROBLEM_TYPE.CREATE', { name: query.trim() })
          }}
        </span>
      </button>

      <button
        v-if="canReset && !query"
        type="button"
        class="flex items-center gap-2 px-2 py-1.5 text-sm text-left rounded-md text-n-slate-11 hover:bg-n-alpha-2 disabled:opacity-50"
        :disabled="isSaving"
        @click="select(null)"
      >
        <Icon icon="i-lucide-x" class="flex-shrink-0 size-4" />
        <span class="truncate">{{ t('CONVERSATION.PROBLEM_TYPE.RESET') }}</span>
      </button>
    </div>

    <div v-if="isSaving || isFetching" class="flex justify-center py-1">
      <Spinner size="small" />
    </div>
  </div>
</template>
