import axios from 'axios';
import { APP_BASE_URL } from 'widget/helpers/constants';
import { getActiveConversationId } from 'widget/helpers/activeConversation';

export const API = axios.create({
  baseURL: APP_BASE_URL,
  withCredentials: false,
});

// Когда клиент выбрал конкретный тикет в "Мои заявки" (не обязательно
// последний), подмешиваем conversation_id во все запросы к диалогу/сообщениям,
// чтобы бэкенд знал, с каким именно тикетом сейчас работает виджет
// (см. Api::V1::Widget::BaseController#conversation и helpers/activeConversation.js).
// Остальные виджет-эндпоинты (campaigns, inbox_members, contact и т.д.)
// параметр просто не читают — он им не мешает.
const CONVERSATION_SCOPED_PATHS = ['/widget/conversations', '/widget/messages'];

API.interceptors.request.use(config => {
  const conversationId = getActiveConversationId();
  const isConversationScoped = CONVERSATION_SCOPED_PATHS.some(path =>
    config.url?.includes(path)
  );
  if (conversationId && isConversationScoped) {
    config.params = {
      ...(config.params || {}),
      conversation_id: conversationId,
    };
  }
  return config;
});

export const setHeader = (value, key = 'X-Auth-Token') => {
  API.defaults.headers.common[key] = value;
};

export const removeHeader = key => {
  delete API.defaults.headers.common[key];
};
