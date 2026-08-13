const axios = require('axios');

// Тонкая обёртка над Application API Chatwoot.
// Аутентификация — access token самого агент-бота (заголовок api_access_token),
// см. app/controllers/api/base_controller.rb: authenticate_by_access_token?.
function createChatwootClient({ baseUrl, accountId, token }) {
  const http = axios.create({
    baseURL: `${baseUrl}/api/v1/accounts/${accountId}`,
    headers: {
      api_access_token: token,
      'Content-Type': 'application/json',
    },
    timeout: 10000,
  });

  // Кэш имя-команды → team_id, чтобы не дёргать /teams на каждый submit.
  let teamsCache = null;

  return {
    // Обычное текстовое сообщение от бота
    async sendText(conversationId, content) {
      return http.post(`/conversations/${conversationId}/messages`, {
        content,
        message_type: 'outgoing',
        content_type: 'text',
      });
    },

    // Вопрос с нативной валидацией email на виджете — content_type:
    // 'input_email' (см. app/models/message.rb, content_type enum).
    async sendEmailQuestion(conversationId, prompt) {
      return http.post(`/conversations/${conversationId}/messages`, {
        content: prompt,
        message_type: 'outgoing',
        content_type: 'input_email',
      });
    },

    // Меню кнопок. items: [{ id, title, value }]
    // content_type: 'input_select' — рендерится ChatOptions.vue на виджете
    // (app/javascript/widget/components/AgentMessageBubble.vue).
    async sendMenu(conversationId, title, items) {
      return http.post(`/conversations/${conversationId}/messages`, {
        content: title,
        message_type: 'outgoing',
        content_type: 'input_select',
        content_attributes: { items },
      });
    },

    // Навесить лейбл на диалог — способ передачи "живому" специалисту
    // (агент/отдел мониторит очередь по лейблу).
    async addLabel(conversationId, label) {
      return http.post(`/conversations/${conversationId}/labels`, {
        labels: [label],
      });
    },

    // Прямой ассайн на команду по team_id (см. соответствующий метод
    // assignTeamByName ниже — обычно удобнее вызывать его).
    async assignTeam(conversationId, teamId) {
      return http.post(`/conversations/${conversationId}/assignments`, {
        team_id: teamId,
      });
    },

    async listTeams() {
      const { data } = await http.get('/teams');
      return data;
    },

    // То, чем в Freshchat является узел "Призначити групі" — назначить
    // диалог на команду по её названию (как в flows.js: group).
    // Команды нужно создать заранее в Chatwoot (Settings → Teams) с теми же
    // именами, что и группы в Freshchat — тогда маршрутизация 1-в-1.
    // Сравнение без учёта регистра: Team#name принудительно приводится к
    // нижнему регистру самим Chatwoot при сохранении (see app/models/team.rb,
    // before_validation { name.downcase }) — то, что название в UI выглядит
    // с заглавными буквами, это просто CSS (text-transform), не реальное
    // значение в базе.
    async assignTeamByName(conversationId, teamName) {
      if (!teamsCache) {
        teamsCache = await this.listTeams();
      }
      const needle = teamName.trim().toLowerCase();
      const team = teamsCache.find(t => t.name.trim().toLowerCase() === needle);
      if (!team) {
        console.warn(
          `[chatwootClient] команда "${teamName}" не найдена в Chatwoot — ` +
            'создайте её в Settings → Teams с таким же названием.'
        );
        return null;
      }
      return this.assignTeam(conversationId, team.id);
    },

    // Резолв диалога — см. engine.js → submit, и README →
    // "Тикеты и несколько заявок от одного клиента".
    async resolveConversation(conversationId) {
      return http.post(`/conversations/${conversationId}/toggle_status`, {
        status: 'resolved',
      });
    },

    // Список диалогов (все статусы), постранично — для дашборда.
    // Ответ: { meta: {...}, payload: [...] }, см.
    // app/views/api/v1/accounts/conversations/index.json.jbuilder —
    // каждый элемент payload уже содержит meta.sender (контакт) и
    // meta.team, так что не нужно отдельно тянуть контакты/команды.
    async listConversations({ status = 'all', page = 1 } = {}) {
      const { data } = await http.get('/conversations', { params: { status, page } });
      return data.data;
    },

    // Агрегированная статистика ответов/решений — используем родные отчёты
    // Chatwoot (app/builders/v2/reports/conversations/metric_builder.rb),
    // а не считаем среднее время вручную: там учтены рабочие часы,
    // переназначения и т.п. — переизобретать не нужно.
    // type: 'account' | 'team' | 'agent' | 'inbox', id — обязателен кроме account.
    // since/until — unix-время в секундах.
    async getReportSummary({ since, until, type = 'account', id } = {}) {
      const { data } = await http.get('/reports/summary', {
        baseURL: `${baseUrl}/api/v2/accounts/${accountId}`,
        params: { since, until, type, id },
      });
      return data;
    },
  };
}

module.exports = { createChatwootClient };
