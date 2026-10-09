<script setup>
// Настройки → Типы проблем. Справочник пополняют операторы прямо из беседы,
// здесь администратор его чистит: переименовывает, объединяет дубли,
// удаляет неиспользуемые.
//
// Удалять можно только тип, который нигде не выбран, — иначе его закрытые
// беседы молча ушли бы в отчёте в «Не указано». Используемый тип
// объединяется с другим типом той же метки: беседы переходят на оставшийся.
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';
import ProblemTypesAPI from 'dashboard/api/problemTypes';

import SettingsLayout from '../SettingsLayout.vue';
import BaseSettingsHeader from '../components/BaseSettingsHeader.vue';
import Button from 'dashboard/components-next/button/Button.vue';
import Dialog from 'dashboard/components-next/dialog/Dialog.vue';

const { t } = useI18n();

const problemTypes = ref([]);
const isFetching = ref(true);
const busyId = ref(null);

const editingId = ref(null);
const editingName = ref('');

const deleteDialogRef = ref(null);
const mergeDialogRef = ref(null);
const dialogItem = ref(null);
const mergeTargetId = ref(null);

const groups = computed(() => {
  const byLabel = new Map();
  problemTypes.value.forEach(item => {
    if (!byLabel.has(item.label_title)) byLabel.set(item.label_title, []);
    byLabel.get(item.label_title).push(item);
  });
  return [...byLabel.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, items]) => ({
      label,
      items: items.sort((a, b) => a.name.localeCompare(b.name)),
    }));
});

const mergeTargets = computed(() =>
  dialogItem.value
    ? problemTypes.value
        .filter(
          item =>
            item.label_title === dialogItem.value.label_title &&
            item.id !== dialogItem.value.id
        )
        .sort((a, b) => a.name.localeCompare(b.name))
    : []
);

const fetchProblemTypes = async () => {
  isFetching.value = true;
  try {
    const { data } = await ProblemTypesAPI.get();
    problemTypes.value = data.payload;
  } catch {
    useAlert(t('PROBLEM_TYPES_SETTINGS.FETCH_ERROR'));
  } finally {
    isFetching.value = false;
  }
};

const errorText = (error, fallbackKey) =>
  error?.response?.data?.error || t(fallbackKey);

const startRename = item => {
  editingId.value = item.id;
  editingName.value = item.name;
};

const cancelRename = () => {
  editingId.value = null;
  editingName.value = '';
};

const saveRename = async item => {
  const name = editingName.value.trim();
  if (!name || name === item.name) {
    cancelRename();
    return;
  }
  busyId.value = item.id;
  try {
    await ProblemTypesAPI.update(item.id, { name });
    useAlert(t('PROBLEM_TYPES_SETTINGS.RENAME.SUCCESS'));
    cancelRename();
    await fetchProblemTypes();
  } catch (error) {
    useAlert(errorText(error, 'PROBLEM_TYPES_SETTINGS.RENAME.ERROR'));
  } finally {
    busyId.value = null;
  }
};

const openDelete = item => {
  dialogItem.value = item;
  deleteDialogRef.value?.open();
};

const confirmDelete = async () => {
  const item = dialogItem.value;
  busyId.value = item.id;
  try {
    await ProblemTypesAPI.delete(item.id);
    useAlert(t('PROBLEM_TYPES_SETTINGS.DELETE.SUCCESS'));
    deleteDialogRef.value?.close();
    await fetchProblemTypes();
  } catch (error) {
    useAlert(errorText(error, 'PROBLEM_TYPES_SETTINGS.DELETE.ERROR'));
  } finally {
    busyId.value = null;
  }
};

const openMerge = item => {
  dialogItem.value = item;
  mergeTargetId.value = null;
  mergeDialogRef.value?.open();
};

const confirmMerge = async () => {
  const item = dialogItem.value;
  if (!mergeTargetId.value) return;
  busyId.value = item.id;
  try {
    await ProblemTypesAPI.merge(item.id, mergeTargetId.value);
    useAlert(t('PROBLEM_TYPES_SETTINGS.MERGE.SUCCESS'));
    mergeDialogRef.value?.close();
    await fetchProblemTypes();
  } catch (error) {
    useAlert(errorText(error, 'PROBLEM_TYPES_SETTINGS.MERGE.ERROR'));
  } finally {
    busyId.value = null;
  }
};

onMounted(fetchProblemTypes);
</script>

<template>
  <SettingsLayout
    :is-loading="isFetching"
    :loading-message="t('PROBLEM_TYPES_SETTINGS.LOADING')"
  >
    <template #header>
      <BaseSettingsHeader
        :title="t('PROBLEM_TYPES_SETTINGS.HEADER')"
        :description="t('PROBLEM_TYPES_SETTINGS.DESCRIPTION')"
      />
    </template>

    <template #body>
      <p v-if="!groups.length" class="text-sm text-n-slate-11">
        {{ t('PROBLEM_TYPES_SETTINGS.EMPTY') }}
      </p>

      <div class="flex flex-col gap-6">
        <section v-for="group in groups" :key="group.label">
          <h3 class="mb-2 text-sm font-medium text-n-slate-12">
            {{ group.label }}
          </h3>
          <div class="overflow-hidden border rounded-xl border-n-weak">
            <div
              class="grid grid-cols-[1fr_6rem_auto] gap-4 px-4 py-2 text-xs font-medium uppercase bg-n-alpha-1 text-n-slate-11"
            >
              <span>{{ t('PROBLEM_TYPES_SETTINGS.TABLE.NAME') }}</span>
              <span class="text-right">
                {{ t('PROBLEM_TYPES_SETTINGS.TABLE.CONVERSATIONS') }}
              </span>
              <span class="text-right">
                {{ t('PROBLEM_TYPES_SETTINGS.TABLE.ACTIONS') }}
              </span>
            </div>
            <div
              v-for="item in group.items"
              :key="item.id"
              class="grid grid-cols-[1fr_6rem_auto] items-center gap-4 px-4 py-2 border-t border-n-weak"
            >
              <div class="min-w-0">
                <input
                  v-if="editingId === item.id"
                  v-model="editingName"
                  type="text"
                  class="w-full px-2 py-1 text-sm rounded-md bg-n-alpha-black2 outline outline-1 outline-n-weak focus:outline-n-brand text-n-slate-12"
                  @keydown.enter.prevent="saveRename(item)"
                  @keydown.esc.prevent="cancelRename"
                />
                <span v-else class="text-sm truncate text-n-slate-12">
                  {{ item.name }}
                </span>
              </div>
              <span class="text-sm text-right tabular-nums text-n-slate-11">
                {{ item.conversations_count }}
              </span>
              <div class="flex justify-end gap-2">
                <template v-if="editingId === item.id">
                  <Button
                    :label="t('PROBLEM_TYPES_SETTINGS.RENAME.SAVE')"
                    size="sm"
                    :is-loading="busyId === item.id"
                    @click="saveRename(item)"
                  />
                  <Button
                    :label="t('PROBLEM_TYPES_SETTINGS.RENAME.CANCEL')"
                    size="sm"
                    variant="faded"
                    color="slate"
                    @click="cancelRename"
                  />
                </template>
                <!-- Иконки вместо подписей — как на странице «Инбоксы»;
                     подпись остаётся в подсказке и в aria-label. -->
                <template v-else>
                  <Button
                    v-tooltip.top="t('PROBLEM_TYPES_SETTINGS.RENAME.BUTTON')"
                    :aria-label="t('PROBLEM_TYPES_SETTINGS.RENAME.BUTTON')"
                    icon="i-lucide-pencil"
                    slate
                    sm
                    @click="startRename(item)"
                  />
                  <Button
                    v-if="item.conversations_count === 0"
                    v-tooltip.top="t('PROBLEM_TYPES_SETTINGS.DELETE.BUTTON')"
                    :aria-label="t('PROBLEM_TYPES_SETTINGS.DELETE.BUTTON')"
                    icon="i-lucide-trash-2"
                    slate
                    sm
                    class="hover:enabled:text-n-ruby-11 hover:enabled:bg-n-ruby-2"
                    @click="openDelete(item)"
                  />
                  <Button
                    v-else
                    v-tooltip.top="t('PROBLEM_TYPES_SETTINGS.MERGE.BUTTON')"
                    :aria-label="t('PROBLEM_TYPES_SETTINGS.MERGE.BUTTON')"
                    icon="i-lucide-merge"
                    slate
                    sm
                    @click="openMerge(item)"
                  />
                </template>
              </div>
            </div>
          </div>
        </section>
      </div>

      <Dialog
        ref="deleteDialogRef"
        type="alert"
        :title="
          t('PROBLEM_TYPES_SETTINGS.DELETE.TITLE', {
            name: dialogItem?.name || '',
          })
        "
        :description="t('PROBLEM_TYPES_SETTINGS.DELETE.DESCRIPTION')"
        :confirm-button-label="t('PROBLEM_TYPES_SETTINGS.DELETE.CONFIRM')"
        :is-loading="busyId === dialogItem?.id"
        @confirm="confirmDelete"
      />

      <Dialog
        ref="mergeDialogRef"
        :title="
          t('PROBLEM_TYPES_SETTINGS.MERGE.TITLE', {
            name: dialogItem?.name || '',
          })
        "
        :description="
          t('PROBLEM_TYPES_SETTINGS.MERGE.DESCRIPTION', {
            name: dialogItem?.name || '',
            count: dialogItem?.conversations_count || 0,
          })
        "
        :confirm-button-label="t('PROBLEM_TYPES_SETTINGS.MERGE.CONFIRM')"
        :disable-confirm-button="!mergeTargetId"
        :is-loading="busyId === dialogItem?.id"
        @confirm="confirmMerge"
      >
        <p v-if="!mergeTargets.length" class="text-sm text-n-slate-11">
          {{ t('PROBLEM_TYPES_SETTINGS.MERGE.NO_TARGETS') }}
        </p>
        <label v-else class="flex flex-col gap-1 text-sm text-n-slate-11">
          {{ t('PROBLEM_TYPES_SETTINGS.MERGE.TARGET') }}
          <select
            v-model="mergeTargetId"
            class="px-2 py-2 text-sm rounded-lg bg-n-alpha-black2 outline outline-1 outline-n-weak text-n-slate-12"
          >
            <option
              v-for="target in mergeTargets"
              :key="target.id"
              :value="target.id"
            >
              {{ target.name }} ({{ target.conversations_count }})
            </option>
          </select>
        </label>
      </Dialog>
    </template>
  </SettingsLayout>
</template>
