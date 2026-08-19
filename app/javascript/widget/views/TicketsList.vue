<script>
import { mapGetters } from 'vuex';
import { useRouter } from 'vue-router';
import Spinner from 'shared/components/Spinner.vue';
import { formatUnixDate } from 'shared/helpers/DateHelper';
import { CONVERSATION_STATUS } from 'shared/constants/messages';
import { setActiveConversationId } from 'widget/helpers/activeConversation';

export default {
  name: 'TicketsList',
  components: { Spinner },
  setup() {
    const router = useRouter();
    return { router };
  },
  data() {
    return {
      // null = фильтр "Все"
      selectedCategory: null,
    };
  },
  computed: {
    ...mapGetters({
      tickets: 'conversationsList/getTickets',
      uiFlags: 'conversationsList/getUIFlags',
    }),
    // Категории берём из самих тикетов (custom_attributes.type), а не из
    // статичного списка — так чипы всегда соответствуют тому, что реально
    // есть у клиента, и не расходятся с конфигом бота.
    categories() {
      const seen = new Set();
      this.tickets.forEach(ticket => {
        if (ticket.category) seen.add(ticket.category);
      });
      return Array.from(seen);
    },
    filteredTickets() {
      if (!this.selectedCategory) return this.tickets;
      return this.tickets.filter(
        ticket => ticket.category === this.selectedCategory
      );
    },
  },
  mounted() {
    this.$store.dispatch('conversationsList/fetch');
  },
  methods: {
    isResolved(status) {
      return status === CONVERSATION_STATUS.RESOLVED;
    },
    statusLabel(status) {
      return this.$t(`TICKETS_LIST.STATUS.${status.toUpperCase()}`);
    },
    unreadBadgeLabel(count) {
      return count > 9 ? this.$t('TICKETS_LIST.UNREAD_MAX') : String(count);
    },
    formattedDate(ticket) {
      return formatUnixDate(
        ticket.last_activity_at || ticket.created_at,
        'dd MMM, HH:mm'
      );
    },
    ticketMeta(ticket) {
      const date = this.formattedDate(ticket);
      return ticket.category ? `${ticket.category} · ${date}` : date;
    },
    selectCategory(category) {
      this.selectedCategory = category;
    },
    // Переключаемся на выбранный тикет (не обязательно последний) — см.
    // helpers/activeConversation.js. Resolved-тикеты открываются в том же
    // экране /messages, но только для чтения: ChatFooter сам скрывает поле
    // ввода для resolved-статуса (см. hideReplyBox), ничего доп. делать не
    // нужно.
    async openTicket(ticket) {
      setActiveConversationId(ticket.id);
      await Promise.all([
        this.$store.dispatch('conversation/clearConversations'),
        this.$store.dispatch(
          'conversationAttributes/clearConversationAttributes'
        ),
      ]);
      await Promise.all([
        this.$store.dispatch('conversation/fetchOldConversations'),
        this.$store.dispatch('conversationAttributes/getAttributes'),
      ]);
      this.router.push({ name: 'messages' });
    },
  },
};
</script>

<template>
  <!--
    Паддинг раньше висел на этом же прокручиваемом контейнере, а sticky-
    строка фильтров компенсировала его отрицательными -mx-4/-mt-4, чтобы
    "прилипать" к самому верху. В Chrome отрицательный margin-top на
    элементе с position: sticky клэмпится и не применяется (проверено
    вживую: даже inline margin-top !important не сдвигает элемент ни на
    пиксель) — из-за этого чипы визуально резались об шапку при скролле.
    Паддинг перенесён на внутреннюю обёртку с карточками, а сама
    прокручиваемая область — без паддинга, так что sticky-строка прилипает
    к верху естественно, без хаков с отрицательными margin.
  -->
  <div class="flex flex-col flex-1 overflow-auto">
    <div
      v-if="categories.length > 1"
      class="sticky top-0 z-10 flex items-center gap-2 px-4 py-3 overflow-x-auto no-scrollbar bg-n-slate-2 dark:bg-n-solid-1"
    >
      <button
        type="button"
        class="px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap outline-none"
        :class="
          !selectedCategory
            ? 'bg-n-brand text-white'
            : 'bg-n-slate-3 text-n-slate-11 hover:bg-n-slate-4'
        "
        @click="selectCategory(null)"
      >
        {{ $t('TICKETS_LIST.ALL_CATEGORIES') }}
      </button>
      <button
        v-for="category in categories"
        :key="category"
        type="button"
        class="px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap outline-none"
        :class="
          selectedCategory === category
            ? 'bg-n-brand text-white'
            : 'bg-n-slate-3 text-n-slate-11 hover:bg-n-slate-4'
        "
        @click="selectCategory(category)"
      >
        {{ category }}
      </button>
    </div>
    <div class="flex flex-col flex-1 gap-2 p-4">
      <div
        v-if="uiFlags.isFetching && !tickets.length"
        class="flex items-center justify-center flex-1"
      >
        <Spinner size="" />
      </div>
      <div
        v-else-if="!tickets.length"
        class="flex items-center justify-center flex-1 text-sm text-center text-n-slate-11"
      >
        {{ $t('TICKETS_LIST.EMPTY') }}
      </div>
      <button
        v-for="ticket in filteredTickets"
        :key="ticket.id"
        type="button"
        class="flex flex-col gap-1 p-3 text-left rounded-lg outline-none bg-n-solid-2 hover:bg-n-solid-3 dark:bg-n-solid-2 dark:hover:bg-n-solid-3"
        :class="{ 'ring-1 ring-n-ruby-9': ticket.unread_count > 0 }"
        @click="openTicket(ticket)"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm font-medium text-n-slate-12">
            {{ $t('TICKETS_LIST.TICKET_NUMBER', { id: ticket.id }) }}
          </span>
          <div class="flex items-center gap-1.5">
            <span
              v-if="ticket.unread_count > 0"
              class="flex items-center justify-center h-[18px] min-w-[18px] px-1 text-[10px] font-semibold text-white rounded-full bg-n-ruby-9"
            >
              {{ unreadBadgeLabel(ticket.unread_count) }}
            </span>
            <span
              class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap"
              :class="
                isResolved(ticket.status)
                  ? 'bg-n-slate-4 text-n-slate-11'
                  : 'bg-n-teal-4 text-n-teal-11'
              "
            >
              {{ statusLabel(ticket.status) }}
            </span>
          </div>
        </div>
        <p
          v-if="ticket.last_message"
          class="overflow-hidden text-xs text-ellipsis whitespace-nowrap"
          :class="
            ticket.unread_count > 0
              ? 'text-n-slate-12 font-medium'
              : 'text-n-slate-11'
          "
        >
          {{ ticket.last_message }}
        </p>
        <div class="text-xs text-n-slate-10">{{ ticketMeta(ticket) }}</div>
      </button>
    </div>
  </div>
</template>
