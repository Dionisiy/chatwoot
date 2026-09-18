import { sendMessage } from 'widget/helpers/utils';
import ContactsAPI from '../../api/contacts';
import { SET_USER_ERROR } from '../../constants/errorTypes';
import { setHeader } from '../../helpers/axios';
const state = {
  currentUser: {},
};

const SET_CURRENT_USER = 'SET_CURRENT_USER';
const parseErrorData = error =>
  error && error.response && error.response.data ? error.response.data : error;
export const updateWidgetAuthToken = widgetAuthToken => {
  if (widgetAuthToken) {
    setHeader(widgetAuthToken);
    sendMessage({
      event: 'setAuthCookie',
      data: { widgetAuthToken },
    });
  }
};

export const getters = {
  getCurrentUser(_state) {
    return _state.currentUser;
  },
};

export const actions = {
  get: async ({ commit }) => {
    try {
      const { data } = await ContactsAPI.get();
      commit(SET_CURRENT_USER, data);

      // Сверяем, что думает о клиенте сервер, с тем, что думает SDK.
      //
      // SDK хранит в cookie cw_user_<token> хэш последних данных setUser и,
      // если новый вызов даёт тот же хэш, молча выходит, не отправляя запрос
      // (см. entrypoints/sdk.js#setUser). Задумано как экономия, но если
      // контакт на сервере остался анонимным — идентификация не долетела,
      // контакт пересоздали, чистили тестовые данные, — cookie убеждает SDK,
      // что всё уже отправлено, и клиент навсегда остаётся безымянным: год,
      // до истечения cookie. Ровно так на проде один браузер создал семь
      // заявок подряд без имени.
      //
      // Имя для проверки не годится: анониму Chatwoot сам выдаёт прозвище
      // вроде "red-rain-157", и has_name у него тоже true. Честные признаки
      // опознанного клиента — identifier или email.
      if (!data.identifier && !data.has_email) {
        sendMessage({ event: 'clearUserCookie' });
      }
    } catch (error) {
      // Ignore error
    }
  },
  update: async ({ dispatch }, { user }) => {
    try {
      await ContactsAPI.update(user);
      dispatch('get');
    } catch (error) {
      // Ignore error
    }
  },
  setUser: async ({ dispatch }, { identifier, user: userObject }) => {
    try {
      const {
        email,
        name,
        avatar_url,
        identifier_hash: identifierHash,
        phone_number,
        company_name,
        city,
        country_code,
        description,
        custom_attributes,
        social_profiles,
      } = userObject;
      const user = {
        email,
        name,
        avatar_url,
        identifier_hash: identifierHash,
        phone_number,
        additional_attributes: {
          company_name,
          city,
          description,
          country_code,
          social_profiles,
        },
        custom_attributes,
      };
      const {
        data: { widget_auth_token: widgetAuthToken },
      } = await ContactsAPI.setUser(identifier, user);
      updateWidgetAuthToken(widgetAuthToken);
      dispatch('get');
      if (identifierHash || widgetAuthToken) {
        dispatch('conversation/clearConversations', {}, { root: true });
        dispatch('conversation/fetchOldConversations', {}, { root: true });
        dispatch('conversationAttributes/getAttributes', {}, { root: true });
      }
    } catch (error) {
      const data = parseErrorData(error);
      sendMessage({ event: 'error', errorType: SET_USER_ERROR, data });
    }
  },
  setCustomAttributes: async (_, customAttributes = {}) => {
    try {
      await ContactsAPI.setCustomAttributes(customAttributes);
    } catch (error) {
      // Ignore error
    }
  },
  deleteCustomAttribute: async (_, customAttribute) => {
    try {
      await ContactsAPI.deleteCustomAttribute(customAttribute);
    } catch (error) {
      // Ignore error
    }
  },
};

export const mutations = {
  [SET_CURRENT_USER]($state, user) {
    const { currentUser } = $state;
    $state.currentUser = { ...currentUser, ...user };
  },
};

export default {
  namespaced: true,
  state,
  getters,
  actions,
  mutations,
};
