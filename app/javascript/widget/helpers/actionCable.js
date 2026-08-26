import BaseActionCableConnector from '../../shared/helpers/BaseActionCableConnector';
import { playNewMessageNotificationInWidget } from 'widget/helpers/WidgetAudioNotificationHelper';
import { ON_AGENT_MESSAGE_RECEIVED } from '../constants/widgetBusEvents';
import { IFrameHelper } from 'widget/helpers/utils';
import { shouldTriggerMessageUpdateEvent } from './IframeEventHelper';
import { CHATWOOT_ON_MESSAGE } from '../constants/sdkEvents';
import { emitter } from '../../shared/helpers/mitt';

// Живой агент отвечает как sender_type: 'User', но подавляющее большинство
// реплик в этом проекте (меню, вопросы, подтверждение заявки) отправляет
// наш бот (agent-bot-scenarios), который аутентифицируется отдельным
// AgentBot-токеном (см. chatwootClient.js) — такие сообщения приходят с
// sender_type: 'AgentBot', а не 'User'. Captain::Assistant — тот же случай
// "не живой агент, но исходящий ответ", см. Message#bot_message? в Rails.
// Раньше проверка ниже пропускала только 'User', из-за чего звук и точка на
// иконке НЕ срабатывали почти на весь реальный диалог с ботом — только на
// сообщения от живого агента.
const NOTIFIABLE_SENDER_TYPES = ['User', 'AgentBot', 'Captain::Assistant'];

const isMessageInActiveConversation = (getters, message) => {
  const { conversation_id: conversationId } = message;
  const activeConversationId =
    getters['conversationAttributes/getConversationParams'].id;
  return activeConversationId && conversationId !== activeConversationId;
};

const WIDGET_PRESENCE_INTERVAL = 60000;

class ActionCableConnector extends BaseActionCableConnector {
  constructor(app, pubsubToken) {
    super(app, pubsubToken, '', WIDGET_PRESENCE_INTERVAL);
    this.events = {
      'message.created': this.onMessageCreated,
      'message.updated': this.onMessageUpdated,
      'conversation.typing_on': this.onTypingOn,
      'conversation.typing_off': this.onTypingOff,
      'conversation.status_changed': this.onStatusChange,
      'conversation.created': this.onConversationCreated,
      'presence.update': this.onPresenceUpdate,
      'contact.merged': this.onContactMerge,
    };
  }

  onDisconnected = () => {
    this.setLastMessageId();
  };

  onReconnect = () => {
    this.syncLatestMessages();
    // Re-fetch conversation attributes so a status change (e.g. auto-resolve)
    // that happened while disconnected is reflected, keeping the reply box state correct.
    this.app.$store.dispatch('conversationAttributes/getAttributes');
  };

  setLastMessageId = () => {
    this.app.$store.dispatch('conversation/setLastMessageId');
  };

  syncLatestMessages = () => {
    this.app.$store.dispatch('conversation/syncLatestMessages');
  };

  onStatusChange = data => {
    if (data.status === 'resolved') {
      this.app.$store.dispatch('campaign/resetCampaign');
    }
    this.app.$store.dispatch('conversationAttributes/update', data);
    // Статус тикета в "Мои заявки" (см. views/TicketsList.vue) мог смениться
    // не только у активного диалога — не молчим, если список уже открывали.
    this.app.$store.dispatch('conversationsList/refreshIfLoaded');
  };

  onMessageCreated = data => {
    // Событие приходит по общей pubsub-подписке контакта — по ВСЕМ его
    // тикетам, не только по активному (см. isMessageInActiveConversation).
    // Раньше "Мои заявки" из-за этого не обновлялся на новые сообщения в
    // других тикетах.
    this.app.$store.dispatch('conversationsList/refreshIfLoaded');

    // Звук и красная точка на иконке виджета — тоже раньше были заперты
    // внутри "только активный диалог" ниже: если у клиента несколько
    // открытых заявок и агент отвечает не в последнюю (не активную сейчас),
    // клиент не получал вообще никакого сигнала — ни звука, ни точки на
    // иконке. Эти два сигнала не привязаны к конкретному отрендеренному
    // диалогу (в отличие от addOrUpdateMessage ниже, который реально
    // дописывает сообщение в открытую сейчас переписку), поэтому их можно и
    // нужно поднимать на любое сообщение от агента/бота, а не только на
    // сообщение в активном диалоге.
    if (NOTIFIABLE_SENDER_TYPES.includes(data.sender_type)) {
      playNewMessageNotificationInWidget();
      IFrameHelper.sendMessage({
        event: 'handleNotificationDot',
        unreadMessageCount: 1,
      });
    }

    if (isMessageInActiveConversation(this.app.$store.getters, data)) {
      return;
    }

    this.app.$store
      .dispatch('conversation/addOrUpdateMessage', data)
      .then(() => emitter.emit(ON_AGENT_MESSAGE_RECEIVED));

    IFrameHelper.sendMessage({
      event: 'onEvent',
      eventIdentifier: CHATWOOT_ON_MESSAGE,
      data,
    });
  };

  onMessageUpdated = data => {
    if (isMessageInActiveConversation(this.app.$store.getters, data)) {
      return;
    }

    if (shouldTriggerMessageUpdateEvent(data)) {
      IFrameHelper.sendMessage({
        event: 'onEvent',
        eventIdentifier: CHATWOOT_ON_MESSAGE,
        data,
      });
    }

    this.app.$store.dispatch('conversation/addOrUpdateMessage', data);
  };

  onConversationCreated = () => {
    this.app.$store.dispatch('conversationAttributes/getAttributes');
  };

  onPresenceUpdate = data => {
    this.app.$store.dispatch('agent/updatePresence', data.users);
  };

  // eslint-disable-next-line class-methods-use-this
  onContactMerge = data => {
    const { pubsub_token: pubsubToken } = data;
    ActionCableConnector.refreshConnector(pubsubToken);
  };

  onTypingOn = data => {
    const activeConversationId =
      this.app.$store.getters['conversationAttributes/getConversationParams']
        .id;
    const isUserTypingOnAnotherConversation =
      data.conversation && data.conversation.id !== activeConversationId;

    if (isUserTypingOnAnotherConversation || data.is_private) {
      return;
    }
    this.clearTimer();
    this.app.$store.dispatch('conversation/toggleAgentTyping', {
      status: 'on',
    });
    this.initTimer();
  };

  onTypingOff = () => {
    this.clearTimer();
    this.app.$store.dispatch('conversation/toggleAgentTyping', {
      status: 'off',
    });
  };

  clearTimer = () => {
    if (this.CancelTyping) {
      clearTimeout(this.CancelTyping);
      this.CancelTyping = null;
    }
  };

  initTimer = () => {
    // Turn off typing automatically after 30 seconds
    this.CancelTyping = setTimeout(() => {
      this.onTypingOff();
    }, 30000);
  };
}

export default ActionCableConnector;
