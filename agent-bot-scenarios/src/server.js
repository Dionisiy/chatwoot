require('dotenv').config();
const path = require('path');
const express = require('express');
const { createChatwootClient, verifyAdminToken, getProfile } = require('./chatwootClient');
const { verifySignature } = require('./verifySignature');
const engine = require('./engine');
const { buildDashboardData } = require('./dashboard');
const flowStore = require('./flowStore');

const PORT = process.env.PORT || 8000;

// /admin и /dashboard — собранные Vue-приложения (см. web/, vite.config.js).
// `npm run build` (часть deploy.sh) кладёт их сюда; в самом Node ничего не
// собирается на лету.
const DIST_DIR = path.join(__dirname, '..', 'dist');

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
      // listTeams() внутри chatwootClient.js жёстко требует adminHttp (иначе
      // молча возвращает [] — это специально для токена БОТА, которому
      // GET /teams запрещён). token этого клиента и так уже админский, но
      // без явного adminToken тут adminHttp не создаётся, и раздел "по
      // командам" в /dashboard всегда был пустым. Передаём тот же токен
      // вторым параметром, чтобы listTeams() реально сработал.
      adminToken: process.env.CHATWOOT_ADMIN_TOKEN,
    })
  : null;

const app = express();

// По умолчанию Express считает "/admin" и "/admin/" одним и тем же
// маршрутом (strict routing выключен) — тогда первый зарегистрированный
// обработчик (редирект без слэша) перехватывает и версию со слэшем тоже, и
// сама страница никогда не отдаётся. Нужно различать их по-настоящему: без
// слэша — редирект, со слэшем — контент (см. комментарий у app.get('/admin', ...) ниже).
app.set('strict routing', true);

// Сохраняем raw body — нужен для проверки HMAC-подписи Chatwoot.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  })
);

app.get('/health', (_req, res) => res.json({ ok: true }));

// vite.config.js собирает /admin и /dashboard с base: './' (относительные
// пути к ассетам и fetch()-запросы внутри Vue-приложений идут без ведущего
// слэша) — это принципиально из-за nginx-прокси на дроплете (location
// /agent-bot/ { proxy_pass http://127.0.0.1:8010/; }, префикс обрезается,
// сам Node о нём не знает). Относительные пути браузер резолвит от текущего
// URL страницы — а он резолвится по-разному в зависимости от того, есть ли
// на конце "/": ".../agent-bot/admin" (без слэша) — "admin" в резолвинге
// считается файлом и отбрасывается, ".../agent-bot/dashboard" — тоже. Чтобы
// и ассеты (./assets/x.js), и API (api/flows) резолвились ОДИНАКОВО как
// "вложенные" в /admin/ или /dashboard/, а не как соседи по /agent-bot/,
// оба маршрута обязаны отдаваться именно с "/" на конце — отсюда редиректы
// ниже. Без них GET .../agent-bot/admin/api/flows превращался бы в
// .../agent-bot/api/flows, мимо всех маршрутов.
app.get('/admin', requireAdminAuth, (_req, res) => res.redirect(302, 'admin/'));
app.get('/dashboard', (_req, res) => res.redirect(302, 'dashboard/'));

app.use('/admin/assets', express.static(path.join(DIST_DIR, 'assets')));
app.use('/dashboard/assets', express.static(path.join(DIST_DIR, 'assets')));

// /dashboard как был открыт без авторизации, так и остаётся — доступ к нему
// не запрашивали, страница держится на своём собственном CHATWOOT_ADMIN_TOKEN
// на сервере, а не на личных правах того, кто её открыл.
app.get('/dashboard/', (_req, res) => {
  res.sendFile(path.join(DIST_DIR, 'dashboard.html'));
});

// clients[].categories и элементы weeklyTrend — Map (см. dashboard.js), а
// JSON.stringify(Map) даёт '{}'. Разворачиваем в обычные объекты/массивы
// перед отправкой — это чисто вопрос сериализации, buildDashboardData саму
// логику агрегации не меняет.
function serializeDashboardData(data) {
  return {
    ...data,
    clients: data.clients.map(c => ({ ...c, categories: Object.fromEntries(c.categories) })),
    weeklyTrend: data.weeklyTrend.map(([week, categoryMap]) => [week, Object.fromEntries(categoryMap)]),
  };
}

// since/until — unix-секунды, произвольный период с фронта (PeriodPicker.vue).
// Оба необязательны: без них buildDashboardData берёт всю историю диалогов
// (см. dashboard.js#buildDashboardData).
function parseRangeParams(req) {
  const since = req.query.since ? Number(req.query.since) : undefined;
  const until = req.query.until ? Number(req.query.until) : undefined;
  return {
    since: Number.isFinite(since) ? since : undefined,
    until: Number.isFinite(until) ? until : undefined,
  };
}

app.get('/dashboard/api/data', async (req, res) => {
  if (!dashboardClient) {
    res.status(500).json({
      error:
        'CHATWOOT_ADMIN_TOKEN не задан в .env — нужен личный API-токен ' +
        'администратора (Chatwoot → Profile Settings → Access Token), ' +
        'см. README → "Дашборд статистики".',
    });
    return;
  }
  try {
    const data = await buildDashboardData(dashboardClient, parseRangeParams(req));
    res.json(serializeDashboardData(data));
  } catch (err) {
    console.error('[dashboard] failed:', err.message);
    res.status(500).json({ error: `Не удалось собрать дашборд: ${err.message}` });
  }
});

// Доступ к /admin — не отдельный общий пароль, а личный access token живого
// администратора Chatwoot (Profile Settings → Access Token), введённый в
// Basic Auth диалоге браузера как пароль (логин — любой, не проверяется, там
// принято вводить свой email/имя для удобства). Проверяется живьём через
// Chatwoot API на каждый запрос (см. verifyAdminToken в chatwootClient.js) —
// так редактор пускает ровно тех, у кого и так есть права администратора в
// самом Chatwoot, без отдельной учётки. Короткий in-memory кэш — чтобы не
// дёргать Chatwoot на каждый из нескольких запросов одной сессии в редакторе
// (загрузка страницы + GET/POST /admin/api/flows).
const ADMIN_TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;
const adminTokenCache = new Map(); // token -> { ok, expiresAt }

async function requireAdminAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  const token = scheme === 'Basic' && encoded
    ? Buffer.from(encoded, 'base64').toString('utf8').split(':')[1]
    : null;

  if (!token) {
    res.set('WWW-Authenticate', 'Basic realm="SlideEdu Bot Admin"');
    res.status(401).send('Требуется авторизация: пароль — ваш личный access token администратора Chatwoot.');
    return;
  }

  // Сохраняем сырой токен на запросе — POST /admin/api/flows использует его
  // повторно (см. getProfile в chatwootClient.js), чтобы записать в историю
  // версий, КТО сохранил правку. Не хранить в adminTokenCache вместе с
  // ok/expiresAt: там ключ — сам токен, а не место для его копии на запросе.
  req.adminToken = token;

  const cached = adminTokenCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.ok) return next();
    res.set('WWW-Authenticate', 'Basic realm="SlideEdu Bot Admin"');
    res.status(401).send('Токен не подтверждён как токен администратора Chatwoot.');
    return;
  }

  try {
    const ok = await verifyAdminToken({
      baseUrl: process.env.CHATWOOT_BASE_URL,
      accountId: process.env.CHATWOOT_ACCOUNT_ID,
      token,
    });
    adminTokenCache.set(token, { ok, expiresAt: Date.now() + ADMIN_TOKEN_CACHE_TTL_MS });
    if (ok) return next();
    res.set('WWW-Authenticate', 'Basic realm="SlideEdu Bot Admin"');
    res.status(401).send('Токен не подтверждён как токен администратора Chatwoot.');
  } catch (err) {
    console.error('[admin] verifyAdminToken failed:', err.message);
    res.status(502).send('Не удалось проверить токен через Chatwoot API: ' + err.message);
  }
}

app.get('/admin/', requireAdminAuth, (_req, res) => {
  res.sendFile(path.join(DIST_DIR, 'admin.html'));
});

app.get('/admin/api/teams', requireAdminAuth, async (_req, res) => {
  if (!dashboardClient) {
    res.json([]);
    return;
  }
  try {
    res.json((await dashboardClient.listTeams()).map(t => t.name));
  } catch (err) {
    console.error('[admin] listTeams failed:', err.message);
    res.json([]);
  }
});

app.get('/admin/api/agents', requireAdminAuth, async (_req, res) => {
  if (!dashboardClient) {
    res.json([]);
    return;
  }
  try {
    res.json((await dashboardClient.listAgents()).map(a => a.name));
  } catch (err) {
    console.error('[admin] listAgents failed:', err.message);
    res.json([]);
  }
});

app.get('/admin/api/flows', requireAdminAuth, async (_req, res) => {
  try {
    res.json(await flowStore.reloadFlows());
  } catch (err) {
    console.error('[admin] reloadFlows failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/admin/api/flows', requireAdminAuth, async (req, res) => {
  try {
    // Не блокируем сохранение, если Chatwoot недоступен/токен не отдал
    // профиль — getProfile сам не бросает исключений, createdBy в этом
    // случае просто null (см. chatwootClient.js#getProfile).
    const createdBy = await getProfile({
      baseUrl: process.env.CHATWOOT_BASE_URL,
      token: req.adminToken,
    });
    await flowStore.saveFlows(req.body, { createdBy });
    res.json({ ok: true });
  } catch (err) {
    if (err.validationErrors) {
      res.status(422).json({ error: err.message, errors: err.validationErrors });
      return;
    }
    console.error('[admin] saveFlows failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Список версий (без content — список может быть длинным, content незачем
// гонять по сети до того, как выбрали конкретную версию).
app.get('/admin/api/flows/history', requireAdminAuth, async (_req, res) => {
  try {
    res.json(await flowStore.listVersions());
  } catch (err) {
    console.error('[admin] listVersions failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Полное содержимое одной версии — например, чтобы посмотреть, что там,
// прежде чем восстанавливать.
app.get('/admin/api/flows/history/:id', requireAdminAuth, async (req, res) => {
  try {
    const version = await flowStore.getVersion(Number(req.params.id));
    if (!version) {
      res.status(404).json({ error: 'Версия не найдена' });
      return;
    }
    res.json(version);
  } catch (err) {
    console.error('[admin] getVersion failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Откат к старой версии — ЭТО ТОЖЕ сохранение (см. flowStore.js): содержимое
// старой версии записывается как НОВАЯ строка, история не перезаписывается и
// не теряется даже после отката.
app.post('/admin/api/flows/history/:id/restore', requireAdminAuth, async (req, res) => {
  try {
    const version = await flowStore.getVersion(Number(req.params.id));
    if (!version) {
      res.status(404).json({ error: 'Версия не найдена' });
      return;
    }
    const createdBy = await getProfile({
      baseUrl: process.env.CHATWOOT_BASE_URL,
      token: req.adminToken,
    });
    await flowStore.saveFlows(version.content, { createdBy });
    res.json({ ok: true, flows: version.content });
  } catch (err) {
    if (err.validationErrors) {
      res.status(422).json({ error: err.message, errors: err.validationErrors });
      return;
    }
    console.error('[admin] restore failed:', err.message);
    res.status(500).json({ error: err.message });
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
    // 'form' (например, date-picker) шлёт submitted_values как [{ name, value }]
    // — по одному элементу на именованное поле формы (см. AgentMessageBubble.vue
    // #onFormSubmit). 'input_select' шлёт выбранный option как {title, value}
    // без ключа name (см. chatwootClient.js#sendMenu — id намеренно не уходит
    // наружу). Наличие name — надёжный признак именно form-ответа.
    if (submittedValues[0]?.name) {
      return engine.handleFormSubmitted(client, conversationId, submittedValues);
    }
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
      // через message_created, а не message_updated. Та же развилка
      // form/input_select, что и в ветке message_updated выше.
      if (submittedValues[0]?.name) {
        return engine.handleFormSubmitted(client, conversationId, submittedValues);
      }
      const selected = submittedValues[0]?.value ?? submittedValues[0]?.id;
      return engine.handleOptionSelected(client, conversationId, selected);
    }
    if (payload.content) {
      return engine.handleTextAnswer(client, conversationId, payload.content);
    }
  }
}

// Дерево сценария теперь читается из Postgres (см. flowStore.js/db.js), а не
// с диска — кэш нужно заполнить ДО того, как сервер начнёт принимать
// вебхуки, иначе первое же сообщение упадёт на пустом getFlows(). Если это
// не удалось (нет AGENT_BOT_DATABASE_URL, недоступна база, таблица пуста) —
// падаем сразу и громко, а не поднимаем сервер, который не может отвечать
// ни на одно сообщение.
(async () => {
  try {
    await flowStore.init();
  } catch (err) {
    console.error('[startup] flowStore.init() failed:', err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Agent bot router listening on :${PORT}`);
  });
})();
