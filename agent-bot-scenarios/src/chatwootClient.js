const axios = require('axios');

// Тонкая обёртка над Application API Chatwoot.
// Аутентификация — access token самого агент-бота (заголовок api_access_token),
// см. app/controllers/api/base_controller.rb: authenticate_by_access_token?.
//
// adminToken (опционально) — тот же CHATWOOT_ADMIN_TOKEN, что и для /dashboard.
// Нужен для GET /teams: у токенов AgentBot есть жёсткий whitelist разрешённых
// эндпоинтов (app/controllers/concerns/access_token_auth_helper.rb,
// BOT_ACCESSIBLE_ENDPOINTS) — там разрешён POST .../assignments, но НЕ разрешён
// GET .../teams, так что бот получает 401 при попытке сам получить список
// команд. Сам assignment (назначение) при этом делаем токеном бота — это
// разрешённое и more корректное с точки зрения атрибуции действие.
function createChatwootClient({ baseUrl, accountId, token, adminToken }) {
  const http = axios.create({
    baseURL: `${baseUrl}/api/v1/accounts/${accountId}`,
    headers: {
      api_access_token: token,
      'Content-Type': 'application/json',
    },
    timeout: 10000,
  });

  const adminHttp = adminToken
    ? axios.create({
        baseURL: `${baseUrl}/api/v1/accounts/${accountId}`,
        headers: {
          api_access_token: adminToken,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      })
    : null;

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

    // Меню кнопок. items: [{ id, title, value }] — id используется только
    // внутри движка (engine.js) для сопоставления с выбором пользователя;
    // наружу в Chatwoot уходят только title/value — ContentAttributeValidator
    // (app/models/concerns/content_attribute_validator.rb) для content_type
    // 'input_select' разрешает исключительно эти два ключа и отклоняет
    // сообщение 422-й с "contains invalid keys for items" при любом другом.
    // content_type: 'input_select' — рендерится ChatOptions.vue на виджете
    // (app/javascript/widget/components/AgentMessageBubble.vue).
    async sendMenu(conversationId, title, items) {
      return http.post(`/conversations/${conversationId}/messages`, {
        content: title,
        message_type: 'outgoing',
        content_type: 'input_select',
        content_attributes: { items: items.map(({ title: t, value }) => ({ title: t, value })) },
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
      // GET /teams токеном бота даёт 401 (не в BOT_ACCESSIBLE_ENDPOINTS) —
      // используем админский токен, если он задан в .env (CHATWOOT_ADMIN_TOKEN).
      if (!adminHttp) {
        console.warn(
          '[chatwootClient] CHATWOOT_ADMIN_TOKEN не задан — бот не может ' +
            'получить список команд (GET /teams запрещён для токена бота), ' +
            'назначение на команду работать не будет.'
        );
        return [];
      }
      const { data } = await adminHttp.get('/teams');
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

    // Список диалогов (все статусы), постранично — для дашборда.
    // Ответ: { meta: {...}, payload: [...] }, см.
    // app/views/api/v1/accounts/conversations/index.json.jbuilder —
    // каждый элемент payload уже содержит meta.sender (контакт) и
    // meta.team, так что не нужно отдельно тянуть контакты/команды.
    async listConversations({ status = 'all', page = 1 } = {}) {
      const { data } = await http.get('/conversations', { params: { status, page } });
      return data.data;
    },

    // Категория, выбранная в pre-chat форме виджета — custom attribute
    // "Категория" (ключ `type`, Settings → Пользовательские атрибуты →
    // Диалог). ВАЖНО: пользовательские custom attributes лежат в отдельном
    // jsonb-поле `custom_attributes`, а НЕ в `additional_attributes` —
    // последнее зарезервировано под системные поля виджета (browser,
    // referer, initiated_at и т.п., см. ConversationInfo.vue). Их легко
    // перепутать (см. app/views/api/v1/conversations/partials/
    // _conversation.json.jbuilder — оба поля идут подряд), но в UI Chatwoot
    // "Категория" рендерится компонентом <CustomAttributes
    // attribute-type="conversation_attribute">, который читает именно
    // conversation.custom_attributes (см. ConversationInfo.vue). GET
    // /conversations/:id отдаёт custom_attributes прямым полем верхнего
    // уровня, и этот action (`show`) разрешён токену бота (см.
    // AccessTokenAuthHelper::BOT_ACCESSIBLE_ENDPOINTS) — отдельный
    // adminToken тут не нужен. Используется engine.js#startFlow, чтобы не
    // показывать финансовое главное меню в диалогах с другой категорией.
    async getConversationCategory(conversationId) {
      const { data } = await http.get(`/conversations/${conversationId}`);
      return data.custom_attributes?.type || null;
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

// Проверка для /admin (см. server.js#requireAdminAuth): токен, введённый в
// диалоге Basic Auth как пароль, — это личный access token живого
// администратора Chatwoot (Profile Settings → Access Token), а не отдельный
// пароль. GET /webhooks выбран как проверочный запрос осознанно — он
// admin-only (WebhookPolicy#index? → @account_user.administrator?, см.
// app/policies/webhook_policy.rb) и не имеет побочных эффектов, в отличие от
// /reports/summary, который тяжелее считать. Личный токен пользователя (в
// отличие от токена бота) не ограничен BOT_ACCESSIBLE_ENDPOINTS (см.
// access_token_auth_helper.rb: validate_bot_access_token! пропускает всех
// Current.user.is_a?(User) без проверки whitelist'а), так что любой
// admin-only эндпоинт годится для этой проверки.
async function verifyAdminToken({ baseUrl, accountId, token }) {
  try {
    await axios.get(`${baseUrl}/api/v1/accounts/${accountId}/webhooks`, {
      headers: { api_access_token: token },
      timeout: 10000,
    });
    return true;
  } catch (err) {
    if (err.response && (err.response.status === 401 || err.response.status === 403)) {
      return false;
    }
    throw err;
  }
}

module.exports = { createChatwootClient, verifyAdminToken };
