// Состояние диалога по conversationId: { nodeId, formData }.
//
// Это in-memory Map — для боевой нагрузки замените на Redis
// (у вас он уже поднят и под Chatwoot, и под Laravel — можно взять
// отдельный DB-номер, как и с самим Chatwoot: redis://localhost:6379/3).
// Интерфейс ниже сделан так, чтобы замена на Redis была by-1-file.

const conversations = new Map();

function get(conversationId) {
  return conversations.get(conversationId) || null;
}

function set(conversationId, state) {
  conversations.set(conversationId, state);
}

function clear(conversationId) {
  conversations.delete(conversationId);
}

module.exports = { get, set, clear };
