// Виджет по умолчанию всегда работает с "последним" диалогом контакта
// (conversations.last на бэкенде — см. Api::V1::Widget::BaseController#conversation).
// Экран "Мои заявки" (views/TicketsList.vue) позволяет клиенту выбрать ЛЮБОЙ
// свой тикет, а не только последний — это простое in-memory хранилище id
// выбранного тикета, которое api/conversation.js подмешивает во все запросы,
// связанные с диалогом (см. helpers/axios.js interceptor).
//
// Намеренно не Vuex-стейт: нужен на самом нижнем уровне (axios interceptor),
// куда стор тянуть избыточно. Сбрасывается при перезагрузке страницы — это
// нормально, виджет в этом случае просто вернётся к "последнему" диалогу.
let activeConversationId = null;

export const getActiveConversationId = () => activeConversationId;

export const setActiveConversationId = id => {
  activeConversationId = id;
};

export const clearActiveConversationId = () => {
  activeConversationId = null;
};
