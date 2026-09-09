<script setup>
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';
import EmailDeliveriesAPI from 'dashboard/api/emailDeliveries';

import SettingsLayout from '../SettingsLayout.vue';
import BaseSettingsHeader from '../components/BaseSettingsHeader.vue';
import Button from 'dashboard/components-next/button/Button.vue';
import {
  BaseTable,
  BaseTableRow,
  BaseTableCell,
} from 'dashboard/components-next/table';

const { t } = useI18n();

const deliveries = ref([]);
const isFetching = ref(true);
const resendingId = ref(null);
const statusFilter = ref('');
const currentPage = ref(1);
const totalPages = ref(1);

// Порядок статусов повторяет путь письма — от попытки отправки до вердикта
// принимающего сервера (см. модель EmailDelivery).
const STATUSES = [
  'pending',
  'accepted',
  'delivered',
  'bounced',
  'deferred',
  'failed',
];

// Доставленное — зелёным, отказ и упавшая отправка — красным, промежуточные
// состояния — нейтрально: по цвету должно быть сразу видно, где проблема.
const STATUS_CLASSES = {
  delivered: 'bg-n-teal-3 text-n-teal-11',
  bounced: 'bg-n-ruby-3 text-n-ruby-11',
  failed: 'bg-n-ruby-3 text-n-ruby-11',
  deferred: 'bg-n-amber-3 text-n-amber-11',
  pending: 'bg-n-amber-3 text-n-amber-11',
  accepted: 'bg-n-slate-3 text-n-slate-11',
};

const tableHeaders = computed(() => [
  t('EMAIL_DELIVERIES.TABLE.STATUS'),
  t('EMAIL_DELIVERIES.TABLE.RECIPIENT'),
  t('EMAIL_DELIVERIES.TABLE.SUBJECT'),
  t('EMAIL_DELIVERIES.TABLE.DETAILS'),
  t('EMAIL_DELIVERIES.TABLE.SENT_AT'),
  t('EMAIL_DELIVERIES.TABLE.ACTIONS'),
]);

const statusLabel = status =>
  t(`EMAIL_DELIVERIES.STATUS.${status.toUpperCase()}`);

const formatDate = value => (value ? new Date(value).toLocaleString() : '—');

const fetchDeliveries = async () => {
  isFetching.value = true;
  try {
    const { data } = await EmailDeliveriesAPI.get({
      page: currentPage.value,
      status: statusFilter.value,
    });
    deliveries.value = data.payload;
    totalPages.value = data.meta.total_pages;
  } catch {
    useAlert(t('EMAIL_DELIVERIES.FETCH_ERROR'));
  } finally {
    isFetching.value = false;
  }
};

const selectStatus = status => {
  statusFilter.value = status;
  currentPage.value = 1;
  fetchDeliveries();
};

const changePage = page => {
  currentPage.value = page;
  fetchDeliveries();
};

const resend = async delivery => {
  resendingId.value = delivery.id;
  try {
    await EmailDeliveriesAPI.resend(delivery.id);
    useAlert(t('EMAIL_DELIVERIES.RESEND.SUCCESS'));
    // Письмо уходит в очередь, статус меняется не мгновенно — перечитываем
    // список, чтобы не показывать заведомо устаревшую строку.
    await fetchDeliveries();
  } catch (error) {
    useAlert(
      error?.response?.data?.error || t('EMAIL_DELIVERIES.RESEND.ERROR')
    );
  } finally {
    resendingId.value = null;
  }
};

onMounted(fetchDeliveries);
</script>

<template>
  <!-- no-records-found намеренно не используем: он прячет всё тело страницы
       вместе с фильтрами, и из состояния «по этому статусу писем нет» нельзя
       было бы вернуться к «Все». Пустой список показывает сама таблица. -->
  <SettingsLayout
    :is-loading="isFetching"
    :loading-message="t('EMAIL_DELIVERIES.LOADING')"
  >
    <template #header>
      <BaseSettingsHeader
        :title="t('EMAIL_DELIVERIES.HEADER')"
        :description="t('EMAIL_DELIVERIES.DESCRIPTION')"
      >
        <template #actions>
          <Button
            :label="t('EMAIL_DELIVERIES.REFRESH')"
            size="sm"
            variant="faded"
            @click="fetchDeliveries"
          />
        </template>
      </BaseSettingsHeader>
    </template>

    <template #body>
      <div class="flex flex-wrap gap-2 mb-4">
        <button
          type="button"
          class="px-3 py-1 text-sm rounded-lg"
          :class="
            statusFilter === ''
              ? 'bg-n-slate-4 text-n-slate-12'
              : 'text-n-slate-11 hover:bg-n-slate-3'
          "
          @click="selectStatus('')"
        >
          {{ t('EMAIL_DELIVERIES.FILTER_ALL') }}
        </button>
        <button
          v-for="status in STATUSES"
          :key="status"
          type="button"
          class="px-3 py-1 text-sm rounded-lg"
          :class="
            statusFilter === status
              ? 'bg-n-slate-4 text-n-slate-12'
              : 'text-n-slate-11 hover:bg-n-slate-3'
          "
          @click="selectStatus(status)"
        >
          {{ statusLabel(status) }}
        </button>
      </div>

      <!-- BaseTable рисует строки только из именованного слота row и только
           когда ему передан items: заголовки и тело завязаны на эту коллекцию
           (см. BaseTable.vue#showHeaders). -->
      <BaseTable
        :headers="tableHeaders"
        :items="deliveries"
        :no-data-message="t('EMAIL_DELIVERIES.404')"
      >
        <template #row>
          <BaseTableRow v-for="delivery in deliveries" :key="delivery.id">
            <BaseTableCell>
              <span
                class="px-2 py-1 text-xs font-medium rounded-md"
                :class="STATUS_CLASSES[delivery.status]"
              >
                {{ statusLabel(delivery.status) }}
              </span>
            </BaseTableCell>
            <BaseTableCell>
              <span class="text-sm text-n-slate-12">{{
                delivery.to_email
              }}</span>
            </BaseTableCell>
            <BaseTableCell>
              <div class="min-w-0">
                <div class="text-sm truncate text-n-slate-12">
                  {{ delivery.subject || '—' }}
                </div>
                <div
                  v-if="delivery.conversation_display_id"
                  class="text-xs text-n-slate-10"
                >
                  {{
                    t('EMAIL_DELIVERIES.CONVERSATION', {
                      id: delivery.conversation_display_id,
                    })
                  }}
                </div>
              </div>
            </BaseTableCell>
            <BaseTableCell>
              <!-- Ответ принимающего сервера или текст исключения: ради этой
                 колонки журнал и делался, тут лежит причина отказа. -->
              <span class="text-xs break-all text-n-slate-11">
                {{ delivery.mta_response || delivery.error_message || '—' }}
              </span>
            </BaseTableCell>
            <BaseTableCell>
              <span class="text-sm whitespace-nowrap text-n-slate-11">
                {{ formatDate(delivery.delivered_at || delivery.created_at) }}
              </span>
            </BaseTableCell>
            <BaseTableCell>
              <Button
                v-if="delivery.resendable"
                :label="t('EMAIL_DELIVERIES.RESEND.BUTTON')"
                size="sm"
                variant="faded"
                :is-loading="resendingId === delivery.id"
                @click="resend(delivery)"
              />
            </BaseTableCell>
          </BaseTableRow>
        </template>
      </BaseTable>

      <div v-if="totalPages > 1" class="flex gap-2 justify-center mt-4">
        <Button
          :label="t('EMAIL_DELIVERIES.PREV')"
          size="sm"
          variant="faded"
          :disabled="currentPage === 1"
          @click="changePage(currentPage - 1)"
        />
        <span class="self-center text-sm text-n-slate-11">
          {{ currentPage }} / {{ totalPages }}
        </span>
        <Button
          :label="t('EMAIL_DELIVERIES.NEXT')"
          size="sm"
          variant="faded"
          :disabled="currentPage === totalPages"
          @click="changePage(currentPage + 1)"
        />
      </div>
    </template>
  </SettingsLayout>
</template>
