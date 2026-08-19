<script>
import TeamAvailability from 'widget/components/TeamAvailability.vue';
import { mapGetters } from 'vuex';
import { useRouter } from 'vue-router';
import configMixin from 'widget/mixins/configMixin';
import FluentIcon from 'shared/components/FluentIcon/Index.vue';
import ArticleContainer from '../components/pageComponents/Home/Article/ArticleContainer.vue';
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
      conversationSize: 'conversation/getConversationSize',
      unreadMessageCount: 'conversation/getUnreadMessageCount',
    }),
  },
  methods: {
    startConversation() {
      if (this.preChatFormEnabled && !this.conversationSize) {
        return this.router.replace({ name: 'prechat-form' });
      }
      return this.router.replace({ name: 'messages' });
    },
    // Второй CTA главного экрана (наравне с "Начать/продолжить разговор" в
    // TeamAvailability, который по сути и есть "подать заявку" — ведёт в
    // prechat-форму/бота). Раньше история заявок была доступна только
    // мелкой иконкой в шапке (HeaderActions#openTicketsList) — здесь та же
    // навигация, но отдельной полноразмерной кнопкой на главном экране.
    openTicketsList() {
      this.router.push({ name: 'tickets' });
    },
  },
};
</script>

<template>
  <div class="z-50 flex flex-col justify-end flex-1 w-full p-4 gap-4">
    <TeamAvailability
      :available-agents="availableAgents"
      :has-conversation="!!conversationSize"
      :unread-count="unreadMessageCount"
      @start-conversation="startConversation"
    />

    <button
      type="button"
      class="flex items-center justify-center w-full gap-2 py-3 text-sm font-medium rounded-xl outline outline-1 outline-n-container bg-n-background dark:bg-n-solid-2 text-n-slate-12"
      @click="openTicketsList"
    >
      <FluentIcon icon="document" size="18" />
      {{ $t('TICKETS_LIST.BUTTON_TITLE') }}
    </button>

    <ArticleContainer />
  </div>
</template>
