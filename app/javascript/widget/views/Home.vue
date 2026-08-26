<script>
import TeamAvailability from 'widget/components/TeamAvailability.vue';
import { mapGetters } from 'vuex';
import { useRouter } from 'vue-router';
import configMixin from 'widget/mixins/configMixin';
import FluentIcon from 'shared/components/FluentIcon/Index.vue';
import ArticleContainer from '../components/pageComponents/Home/Article/ArticleContainer.vue';
import { IFrameHelper } from '../helpers/utils';
import { CHATWOOT_ON_START_CONVERSATION } from '../constants/sdkEvents';
import { clearActiveConversationId } from '../helpers/activeConversation';

export default {
  name: 'Home',
  components: {
    ArticleContainer,
    TeamAvailability,
    FluentIcon,
  },
  mixins: [configMixin],
  setup() {
    const router = useRouter();
    return { router };
  },
  computed: {
    ...mapGetters({
      availableAgents: 'agent/availableAgents',
      totalUnreadCount: 'conversationsList/getTotalUnreadCount',
    }),
    // '9+', как и per-ticket бейдж в TicketsList.vue — переиспользуем тот же
    // i18n-ключ, чтобы формат совпадал.
    unreadBadgeLabel() {
      return this.totalUnreadCount > 9
        ? this.$t('TICKETS_LIST.UNREAD_MAX')
        : String(this.totalUnreadCount);
    },
  },
  methods: {
    // Кнопка всегда ведёт на новое обращение (pre-chat форма/выбор
    // категории), а не "тихо" продолжает последний открытый диалог —
    // продолжить существующий тикет можно только явно, через "Мои заявки"
    // (openTicketsList). Логика идентична "Начать новую заявку" в
    // ChatFooter.vue: сбрасываем выбранный в "Мои заявки" тикет, иначе
    // следующее сообщение уйдёт по инерции в старый conversation_id.
    startNewConversation() {
      clearActiveConversationId();
      this.router.replace({ name: 'prechat-form' });
      IFrameHelper.sendMessage({
        event: 'onEvent',
        eventIdentifier: CHATWOOT_ON_START_CONVERSATION,
        data: { hasConversation: false },
      });
    },
    // Раньше история заявок была доступна только мелкой иконкой в шапке
    // (HeaderActions#openTicketsList) — здесь та же навигация, но отдельной
    // полноразмерной кнопкой на главном экране.
    openTicketsList() {
      this.router.push({ name: 'tickets' });
    },
  },
};
</script>

<template>
  <div class="z-50 flex flex-col justify-end flex-1 w-full p-4 gap-4">
    <TeamAvailability :available-agents="availableAgents" />

    <div class="flex gap-2">
      <button
        type="button"
        class="flex items-center justify-center flex-1 gap-2 py-3 text-sm font-medium rounded-xl outline outline-1 bg-n-background dark:bg-n-solid-2 text-n-slate-12"
        :class="
          totalUnreadCount > 0
            ? 'outline-n-ruby-9 animate-pulse'
            : 'outline-n-container'
        "
        @click="openTicketsList"
      >
        <FluentIcon icon="document" size="18" />
        {{ $t('TICKETS_LIST.BUTTON_TITLE') }}
        <span
          v-if="totalUnreadCount > 0"
          class="flex items-center justify-center h-[18px] min-w-[18px] px-1 text-[10px] font-semibold text-white rounded-full bg-n-ruby-9"
        >
          {{ unreadBadgeLabel }}
        </span>
      </button>

      <button
        type="button"
        class="flex items-center justify-center flex-1 gap-2 py-3 text-sm font-medium rounded-xl outline outline-1 outline-n-container bg-n-background dark:bg-n-solid-2 text-n-slate-12"
        @click="startNewConversation"
      >
        <FluentIcon icon="chat-outline" size="18" />
        {{ $t('START_ANOTHER_CONVERSATION') }}
      </button>
    </div>

    <ArticleContainer />
  </div>
</template>
