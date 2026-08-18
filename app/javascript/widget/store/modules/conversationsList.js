// Список ВСЕХ тикетов контакта для экрана "Мои заявки" — отдельно от
// store/modules/conversation (который держит сообщения ОДНОГО активного
// диалога). См. api/conversation.js#getConversationsListAPI и
// Api::V1::Widget::ConversationsController#list.
import { getConversationsListAPI } from '../../api/conversation';

const state = {
  records: [],
  hasLoadedOnce: false,
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
  // Клиент видит статус/превью тикета только в момент, когда список открыт —
  // ActionCable-события (новое сообщение, смена статуса) сами по себе список
  // не обновляют. Вызывается из helpers/actionCable.js на каждое такое
  // событие; если список ни разу не загружали в этой сессии — не запрашиваем
  // его молча в фоне, это была бы просто лишняя нагрузка на бэкенд.
  refreshIfLoaded: async ({ state: moduleState, dispatch }) => {
    if (!moduleState.hasLoadedOnce) return;
    await dispatch('fetch');
  },
};

export const mutations = {
  setTickets($state, records) {
    $state.records = records;
    $state.hasLoadedOnce = true;
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
