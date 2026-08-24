<script setup>
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAccount } from 'dashboard/composables/useAccount';
import { useAlert } from 'dashboard/composables';
import Switch from 'next/switch/Switch.vue';
import SingleSelect from 'dashboard/components-next/filter/inputs/SingleSelect.vue';

const { t } = useI18n();
const { currentAccount, updateAccount } = useAccount();

const MATCH_MODE_OPTIONS = [
  { id: 'any', name: t('LABEL_MGMT.ACCESS_SETTINGS.MATCH_MODE.OPTIONS.ANY') },
  { id: 'all', name: t('LABEL_MGMT.ACCESS_SETTINGS.MATCH_MODE.OPTIONS.ALL') },
];

const matchMode = ref(MATCH_MODE_OPTIONS[0]);
const showUnlabeled = ref(true);
const isSubmitting = ref(false);

watch(
  currentAccount,
  () => {
    const {
      label_access_match_mode: mode,
      label_access_show_unlabeled: showUnlabeledSetting,
    } = currentAccount.value?.settings || {};

    matchMode.value =
      MATCH_MODE_OPTIONS.find(option => option.id === mode) ||
      MATCH_MODE_OPTIONS[0];
    // Настройка ещё не трогалась (undefined) — дефолт "показывать", тот же,
    // что и на бэкенде (см. Account#label_access_show_unlabeled?).
    showUnlabeled.value = showUnlabeledSetting ?? true;
  },
  { deep: true, immediate: true }
);

const persist = async () => {
  try {
    isSubmitting.value = true;
    await updateAccount(
      {
        label_access_match_mode: matchMode.value.id,
        label_access_show_unlabeled: showUnlabeled.value,
      },
      { silent: true }
    );
    useAlert(t('LABEL_MGMT.ACCESS_SETTINGS.API.SUCCESS_MESSAGE'));
  } catch (error) {
    useAlert(t('LABEL_MGMT.ACCESS_SETTINGS.API.ERROR_MESSAGE'));
  } finally {
    isSubmitting.value = false;
  }
};

const handleMatchModeChange = option => {
  matchMode.value = option;
  persist();
};

const handleShowUnlabeledChange = () => {
  persist();
};
</script>

<template>
  <div
    class="flex flex-col w-full outline-1 outline outline-n-container rounded-xl bg-n-solid-2 divide-y divide-n-weak mb-6"
  >
    <div class="flex flex-col gap-2 items-start px-5 py-4">
      <h3 class="text-heading-2 text-n-slate-12">
        {{ t('LABEL_MGMT.ACCESS_SETTINGS.TITLE') }}
      </h3>
      <p class="mb-0 text-body-para text-n-slate-11">
        {{ t('LABEL_MGMT.ACCESS_SETTINGS.NOTE') }}
      </p>
    </div>
    <div
      class="rounded-xl border border-n-weak bg-n-solid-1 text-sm text-n-slate-12 divide-y divide-n-weak mx-5 my-4"
    >
      <div class="p-3 flex items-center justify-between gap-4">
        <span>{{ t('LABEL_MGMT.ACCESS_SETTINGS.MATCH_MODE.LABEL') }}</span>
        <SingleSelect
          :model-value="matchMode"
          :options="MATCH_MODE_OPTIONS"
          variant="faded"
          @update:model-value="handleMatchModeChange"
        />
      </div>
      <div class="p-3 h-12 flex items-center justify-between">
        <span>{{ t('LABEL_MGMT.ACCESS_SETTINGS.SHOW_UNLABELED.LABEL') }}</span>
        <Switch
          v-model="showUnlabeled"
          :disabled="isSubmitting"
          @change="handleShowUnlabeledChange"
        />
      </div>
    </div>
  </div>
</template>
