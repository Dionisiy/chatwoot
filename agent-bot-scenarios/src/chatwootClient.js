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
  // Аналогичный кэш для агентов (см. assignAgentByName ниже).
  let agentsCache = null;

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

    // Вопрос с нативным date-picker на виджете — content_type: 'form' с
    // единственным полем type: 'date'. ChatForm.vue (app/javascript/shared/
    // components/ChatForm.vue) рендерит <input :type="item.type">
    // генерически для 'text'/'date' — отдельного клиентского кейса под date
    // заводить не пришлось, только расширили это условие. Ответ приходит НЕ
    // как message_created с обычным текстом и НЕ как submitted_email
    // (это только у input_email) — виджет патчит submitted_values:
    // [{ name, value }] на этом же исходящем сообщении (см.
    // AgentMessageBubble.vue#onFormSubmit), т.е. message_updated, как и у
    // input_select. Отличаем от input_select в server.js по наличию ключа
    // name (см. handleEvent) — маршрутизируется в engine.handleFormSubmitted.
    async sendDateQuestion(conversationId, prompt, fieldName) {
      return http.post(`/conversations/${conversationId}/messages`, {
        content: prompt,
        message_type: 'outgoing',
        content_type: 'form',
        content_attributes: {
          items: [{ name: fieldName, type: 'date', label: prompt, required: true }],
        },
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

    // Навесить лейбл(ы) на диалог — способ передачи "живому" специалисту
    // (агент/отдел мониторит очередь по лейблу). Эндпоинт Chatwoot заменяет
    // ВЕСЬ список лейблов присланным (см. Labelable#update_labels), а не
    // добавляет к существующим — поэтому label может быть массивом: так
    // подкатегория (например "finance-fop") не стирает родительскую
    // категорию ("finance"), проставленную автоматизацией раньше.
    async addLabel(conversationId, label) {
      return http.post(`/conversations/${conversationId}/labels`, {
        labels: Array.isArray(label) ? label : [label],
      });
    },

    // Перевод диалога из Pending в Open через штатный bot-handoff Chatwoot.
    // ВАЖНО: это не резолв. Chatwoot сам переводит любой новый диалог в
    // инбоксе с активным ботом в статус Pending ещё ДО первого сообщения
    // бота (app/models/conversation.rb#determine_conversation_status →
    // set_active_bot_conversation, before_create-хук, наш код тут ни при
    // чём и повлиять на это не может). Единственный штатный способ уйти из
    // Pending — POST /toggle_status с status:'open' от имени самого бота:
    // ConversationsController#toggle_status видит Current.user.is_a?(AgentBot)
    // и status pending→open и вызывает @conversation.bot_handoff! вместо
    // обычной смены статуса — это снимает assignee_agent_bot, ставит
    // status: open и пишет репортинг-событие conversation_bot_handoff
    // (используется в родных метриках бота: bot_handoff_rate и т.п.), т.е.
    // ещё и корректно попадает в статистику вместо того, чтобы её портить.
    // toggle_status разрешён токену бота (BOT_ACCESSIBLE_ENDPOINTS).
    async setStatus(conversationId, status) {
      return http.post(`/conversations/${conversationId}/toggle_status`, { status });
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

    // Прямой ассайн на конкретного агента по assignee_id — тот же эндпоинт
    // assignments, что и assignTeam, только с другим ключом (см.
    // app/controllers/api/v1/accounts/conversations/assignments_controller.rb:
    // params.key?(:assignee_id) ветка). create-экшн этого контроллера уже в
    // BOT_ACCESSIBLE_ENDPOINTS, поэтому назначение (в отличие от чтения
    // списка агентов) работает обычным токеном бота.
    async assignAgent(conversationId, agentId) {
      return http.post(`/conversations/${conversationId}/assignments`, {
        assignee_id: agentId,
      });
    },

    async listAgents() {
      // GET /agents токеном бота даёт 401 (не в BOT_ACCESSIBLE_ENDPOINTS,
      // ровно как и /teams) — используем админский токен.
      if (!adminHttp) {
        console.warn(
          '[chatwootClient] CHATWOOT_ADMIN_TOKEN не задан — бот не может ' +
            'получить список агентов (GET /agents запрещён для токена бота), ' +
            'автоназначение на оператора работать не будет.'
        );
        return [];
      }
      const { data } = await adminHttp.get('/agents');
      return data;
    },

    // Автоназначение заявки конкретному оператору по имени или email,
    // настраивается в узле submit (node.assignee) в /admin — аналог
    // assignTeamByName, но на уровне конкретного человека, а не команды.
    // В отличие от Team#name, Agent#name Chatwoot не приводит к нижнему
    // регистру принудительно, поэтому сравниваем без учёта регистра тут же.
    async assignAgentByName(conversationId, agentIdentifier) {
      if (!agentsCache) {
        agentsCache = await this.listAgents();
      }
      const needle = agentIdentifier.trim().toLowerCase();
      const agent = agentsCache.find(
        a => a.name.trim().toLowerCase() === needle || a.email?.trim().toLowerCase() === needle
      );
      if (!agent) {
        console.warn(
          `[chatwootClient] агент "${agentIdentifier}" не найден в Chatwoot — ` +
            'проверьте имя/email в Settings → Agents.'
        );
        return null;
      }
      return this.assignAgent(conversationId, agent.id);
    },

    // Список диалогов (все статусы), постранично — для дашборда.
    // Ответ: { meta: {...}, payload: [...] }, см.
    // app/views/api/v1/conversations/partials/_conversation.json.jbuilder —
    // каждый элемент payload уже содержит meta.sender (контакт), meta.team
    // и labels (массив title меток, cached_label_list_array) — не нужно
    // отдельно тянуть контакты/команды/метки по каждому диалогу.
    async listConversations({ status = 'all', page = 1 } = {}) {
      const { data } = await http.get('/conversations', { params: { status, page } });
      return data.data;
    },

    // Список категорий (меток) аккаунта — для дашборда, чтобы сматчить
    // название категории (label title, как в conv.labels) с её id и
    // получить среднее время ответа/решения по категории через
    // getReportSummary({ type: 'label', id }).
    async listLabels() {
      const { data } = await http.get('/labels');
      return data.payload || [];
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
    // Диалог целиком одним запросом. Всё, что нужно боту на старте сценария,
    // лежит в этом же ответе:
    //   custom_attributes.type        — категория из pre-chat формы;
    //   meta.sender.custom_attributes — атрибуты контакта (project/languages),
    //                                   которые фронтенд SlideEdu пишет через
    //                                   setUser/setCustomAttributes;
    //   meta.sender.email             — email контакта, по нему бот запрашивает
    //                                   список учеников в SlideEdu.
    // Раньше на каждое из этих трёх полей шёл отдельный GET этого же URL —
    // три одинаковых запроса подряд на старте каждой заявки (см. startFlow).
    async getConversation(conversationId) {
      const { data } = await http.get(`/conversations/${conversationId}`);
      return data;
    },

    // Записать/дополнить custom_attributes ДИАЛОГА (не контакта) — например
    // slideedu_client_id/slideedu_client_name при выборе ученика из списка
    // (см. engine.js#applyStudentSelection). merge: true обязателен: без
    // него этот эндпоинт ЗАМЕНЯЕТ весь custom_attributes целиком (см.
    // ConversationCustomAttributesConcern#custom_attributes в основном
    // Chatwoot-репо) и стёр бы уже проставленную категорию (custom_attributes.type,
    // см. getConversation) — с merge:true он оставляет остальные
    // ключи как есть и обновляет только переданные.
    async setConversationCustomAttributes(conversationId, attributes) {
      return http.post(`/conversations/${conversationId}/custom_attributes`, {
        custom_attributes: attributes,
        merge: true,
      });
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
// Имя/email администратора, сохранившего версию сценария (см. server.js —
// POST /admin/api/flows, flowStore.js#saveFlows createdBy) — просто читаем
// его же личный токен ещё раз, отдельного механизма identity заводить не
// нужно. Не бросает исключение при сбое — атрибуция версии полезна, но не
// настолько, чтобы блокировать само сохранение сценария при недоступности
// этого эндпоинта.
async function getProfile({ baseUrl, token }) {
  try {
    const { data } = await axios.get(`${baseUrl}/api/v1/profile`, {
      headers: { api_access_token: token },
      timeout: 10000,
    });
    return data.name || data.email || null;
  } catch (err) {
    console.error('[chatwootClient] getProfile failed:', err.message);
    return null;
  }
}

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

module.exports = { createChatwootClient, verifyAdminToken, getProfile };
