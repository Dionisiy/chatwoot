require('dotenv').config();
const express = require('express');
const { createChatwootClient } = require('./chatwootClient');
const { verifySignature } = require('./verifySignature');
const engine = require('./engine');
const { buildDashboardData } = require('./dashboard');
const { renderDashboardHtml } = require('./dashboardView');

const PORT = process.env.PORT || 8000;

const client = createChatwootClient({
  baseUrl: process.env.CHATWOOT_BASE_URL,
  accountId: process.env.CHATWOOT_ACCOUNT_ID,
  token: process.env.CHATWOOT_BOT_TOKEN,
  // Нужен только для GET /teams внутри assignTeamByName — токену бота этот
  // эндпоинт запрещён платформой (см. комментарий в chatwootClient.js).
  adminToken: process.env.CHATWOOT_ADMIN_TOKEN,
});

// /dashboard дёргает /reports/summary — этот эндпоинт в Chatwoot доступен
// только администратору аккаунта (см. app/policies/report_policy.rb —
// @account_user.administrator?), у AgentBot такого account_user нет. Поэтому
// для дашборда — отдельный клиент с личным токеном админа
// (Profile Settings → Access Token в самом Chatwoot), не токен бота.
const dashboardClient = process.env.CHATWOOT_ADMIN_TOKEN
  ? createChatwootClient({
      baseUrl: process.env.CHATWOOT_BASE_URL,
      accountId: process.env.CHATWOOT_ACCOUNT_ID,
      token: process.env.CHATWOOT_ADMIN_TOKEN,
    })
  : null;

const app = express();

// Сохраняем raw body — нужен для проверки HMAC-подписи Chatwoot.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  })
);

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/dashboard', async (_req, res) => {
  if (!dashboardClient) {
    res.status(500).send(
      'CHATWOOT_ADMIN_TOKEN не задан в .env — нужен личный API-токен ' +
        'администратора (Chatwoot → Profile Settings → Access Token), ' +
        'см. README → "Дашборд статистики".'
    );
    return;
  }
  try {
    const data = await buildDashboardData(dashboardClient);
    res.send(renderDashboardHtml(data));
  } catch (err) {
    console.error('[dashboard] failed:', err.message);
    res.status(500).send(`Не удалось собрать дашборд: ${err.message}`);
  }
});

app.post('/webhook', verifySignature(process.env.AGENT_BOT_SECRET), async (req, res) => {
  // Отвечаем сразу, обработку не заставляем ждать Chatwoot
  // (см. Webhooks::Trigger::RETRYABLE_AGENT_BOT_STATUSES — 429/500 будут
  // ретраиться, обычный таймаут — нет, поэтому лучше не тормозить ответ).
  res.status(200).json({ ok: true });

  try {
    await handleEvent(req.body);
  } catch (err) {
    console.error('[webhook] handling failed:', err);
  }
});

async function handleEvent(payload) {
  const event = payload.event;
  const conversationId = payload.conversation?.id;
  if (!conversationId) return;

  // Клик по quick-reply кнопке (input_select) не создаёт новое сообщение —
  // виджет патчит submitted_values на ТОМ ЖЕ исходящем сообщении бота
  // (см. app/controllers/api/v1/widget/messages_controller.rb#update:
  // @message.update!(message_update_params[:message])). Поэтому у такого
  // message_updated message_type всё ещё 'outgoing' — фильтровать по
  // incoming здесь нельзя, иначе все клики по кнопкам молча теряются.
  if (event === 'message_updated') {
    const attrs = payload.content_attributes || {};
    // Ответ на поле content_type: input_email — виджет кладёт его в
    // submitted_email (см. messages_controller.rb#update:
    // @message.update!(submitted_email: contact_email)), а не в
    // submitted_values. Обрабатываем как обычный текстовый ответ — там уже
    // есть та же regex-валидация формата и запись в state.formData.
    if (attrs.submitted_email) {
      return engine.handleTextAnswer(client, conversationId, attrs.submitted_email);
    }
    const submittedValues = attrs.submitted_values;
    if (!submittedValues?.length) return; // просто правка сообщения, не наш кейс
    const selected = submittedValues[0]?.value ?? submittedValues[0]?.id;
    return engine.handleOptionSelected(client, conversationId, selected);
  }

  if (event === 'message_created') {
    // А вот здесь фильтр обязателен: message_created прилетает и для
    // исходящих сообщений самого бота — без этой проверки был бы
    // бесконечный цикл (см. app/listeners/agent_bot_listener.rb).
    if (payload.message_type !== 'incoming') return;
    const submittedValues = payload.content_attributes?.submitted_values;
    if (submittedValues?.length) {
      // На всякий случай, если какой-то канал всё же шлёт submitted_values
      // через message_created, а не message_updated.
      const selected = submittedValues[0]?.value ?? submittedValues[0]?.id;
      return engine.handleOptionSelected(client, conversationId, selected);
    }
    if (payload.content) {
      return engine.handleTextAnswer(client, conversationId, payload.content);
    }
  }
}

app.listen(PORT, () => {
  console.log(`Agent bot router listening on :${PORT}`);
});
