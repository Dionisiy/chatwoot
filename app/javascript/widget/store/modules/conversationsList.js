// Список ВСЕХ тикетов контакта для экрана "Мои заявки" — отдельно от
// store/modules/conversation (который держит сообщения ОДНОГО активного
// диалога). См. api/conversation.js#getConversationsListAPI и
// Api::V1::Widget::ConversationsController#list.
import { getConversationsListAPI } from '../../api/conversation';

const state = {
  records: [],
  uiFlags: {
    isFetching: false,
  },
};

export const getters = {
  getTickets: $state => $state.records,
  getUIFlags: $state => $state.uiFlags,
};

export const actions = {
  fetch: async ({ commit }) => {
    commit('setUIFlag', { isFetching: true });
    try {
      const { data } = await getConversationsListAPI();
      commit('setTickets', data.payload || []);
    } catch (error) {
      // Ignore error
    } finally {
      commit('setUIFlag', { isFetching: false });
    }
  },
};

export const mutations = {
  setTickets($state, records) {
    $state.records = records;
  },
  setUIFlag($state, uiFlag) {
    $state.uiFlags = { ...$state.uiFlags, ...uiFlag };
  },
};

export default {
  namespaced: true,
  state,
  getters,
  actions,
  mutations,
};
