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
  computed: {
    ...mapGetters({
      tickets: 'conversationsList/getTickets',
      uiFlags: 'conversationsList/getUIFlags',
    }),
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
  <div class="flex flex-col flex-1 gap-2 p-4 overflow-auto">
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
      v-for="ticket in tickets"
      :key="ticket.id"
      type="button"
      class="flex flex-col gap-1 p-3 text-left rounded-lg bg-n-solid-2 hover:bg-n-solid-3 dark:bg-n-solid-2 dark:hover:bg-n-solid-3"
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
      <span class="text-xs text-n-slate-10">{{ formattedDate(ticket) }}</span>
    </button>
  </div>
</template>
