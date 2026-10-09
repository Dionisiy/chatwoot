// Агрегация данных для /dashboard из "сырого" списка диалогов
// (client.listConversations) + родных отчётов Chatwoot (getReportSummary).
//
// Разделение специально такое: то, чего в Chatwoot нет из коробки —
// "клиент × категория", тренды по неделям и разбивка по категориям/
// сабкатегориям — считаем сами из списка диалогов (там уже есть labels и
// created_at на каждый элемент, см. chatwootClient.js#listConversations).
// То, что Chatwoot уже умеет правильно считать (среднее время ответа и
// решения, с учётом рабочих часов) — просто забираем через отчёты, а не
// пересчитываем вручную.
//
// Категория/сабкатегория выводятся из meток диалога (conv.labels), а не из
// Chatwoot-команд (Team) — команды у бота назначены только части веток
// (см. flows.json: group есть лишь у Финансов), поэтому как источник
// категорий они неполные. Метки же проставляются во всех ветках сценария
// без исключений (см. AGENTS.md).

const { pool } = require('./db');
const { getProblemTypeBreakdown } = require('./problemTypeReport');
const { getOperatorBreakdown } = require('./operatorReport');

function isoWeekStart(unixSeconds) {
  const d = new Date(unixSeconds * 1000);
  const day = (d.getUTCDay() + 6) % 7; // 0 = понедельник
  d.setUTCDate(d.getUTCDate() - day);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

// Беседы за период — прямым запросом в базу Chatwoot (бот подключён к ней же,
// см. db.js). Раньше они выкачивались через API списка бесед постранично по
// 25 штук, и каждая страница стоила около секунды: на 270 беседах дашборд
// открывался 11–12 секунд и рос линейно вместе с базой. Форма элементов та
// же, что отдавал API (id, labels, created_at, meta.sender), — aggregate()
// и остальные разделы не меняются.
async function fetchConversations({ since, until } = {}) {
  const { rows } = await pool.query(
    `SELECT c.display_id, extract(epoch FROM c.created_at)::bigint AS created_at,
            c.cached_label_list, ct.id AS contact_id, ct.name AS contact_name,
            ct.email AS contact_email
       FROM conversations c
       LEFT JOIN contacts ct ON ct.id = c.contact_id
      WHERE c.account_id = $1
        AND ($2::bigint IS NULL OR c.created_at >= to_timestamp($2))
        AND ($3::bigint IS NULL OR c.created_at <= to_timestamp($3))
      ORDER BY c.id`,
    [process.env.CHATWOOT_ACCOUNT_ID, since || null, until || null]
  );
  return rows.map(row => ({
    id: row.display_id,
    created_at: Number(row.created_at),
    labels: (row.cached_label_list || '')
      .split(',')
      .map(label => label.trim())
      .filter(Boolean),
    meta: {
      sender: row.contact_id
        ? {
            id: row.contact_id,
            name: row.contact_name,
            email: row.contact_email,
          }
        : null,
    },
  }));
}

// Категория — метка сама по себе; сабкатегория — любая другая метка того же
// диалога вида "<категория>-...". Правило общее (не привязано жёстко к
// "finance"), поэтому подхватит новые подкатегории у любой другой категории
// метки без правок кода — ровно то, что обсуждали при добавлении
// ограничения видимости категорий для операторов.
function deriveCategory(labels) {
  const list = Array.isArray(labels) ? labels : labels ? [labels] : [];
  if (list.length === 0)
    return { category: 'Без категории', subcategory: null };

  for (const a of list) {
    const sub = list.find(b => b !== a && b.startsWith(`${a}-`));
    if (sub) return { category: a, subcategory: sub };
  }
  return { category: list[0], subcategory: null };
}

// "Клиент × категория", тренд по неделям и разбивка по категориям/
// сабкатегориям — из одного и того же набора диалогов, чтобы цифры в разных
// секциях дашборда не расходились между собой.
function aggregate(conversations) {
  const byContact = new Map();
  const byWeek = new Map();
  const byCategory = new Map(); // name -> { total, subcategories: Map(name -> count) }
  const categoryNames = new Set();

  conversations.forEach(conv => {
    const { category, subcategory } = deriveCategory(conv.labels);
    categoryNames.add(category);

    const contact = conv.meta && conv.meta.sender;
    if (contact) {
      const key = contact.id;
      if (!byContact.has(key)) {
        byContact.set(key, {
          id: contact.id,
          name: contact.name || contact.email || `Контакт #${contact.id}`,
          email: contact.email || '',
          categories: new Map(),
          total: 0,
          lastTicketAt: 0,
        });
      }
      const entry = byContact.get(key);
      entry.categories.set(category, (entry.categories.get(category) || 0) + 1);
      entry.total += 1;
      entry.lastTicketAt = Math.max(entry.lastTicketAt, conv.created_at || 0);
    }

    const week = isoWeekStart(conv.created_at || Date.now() / 1000);
    if (!byWeek.has(week)) byWeek.set(week, new Map());
    const weekMap = byWeek.get(week);
    weekMap.set(category, (weekMap.get(category) || 0) + 1);

    if (!byCategory.has(category))
      byCategory.set(category, { total: 0, subcategories: new Map() });
    const catEntry = byCategory.get(category);
    catEntry.total += 1;
    if (subcategory) {
      catEntry.subcategories.set(
        subcategory,
        (catEntry.subcategories.get(subcategory) || 0) + 1
      );
    }
  });

  const clients = [...byContact.values()].sort((a, b) => b.total - a.total);
  const weeklyTrend = [...byWeek.entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  const categories = [...byCategory.entries()]
    .map(([name, v]) => ({
      name,
      total: v.total,
      subcategories: [...v.subcategories.entries()].sort((a, b) => b[1] - a[1]),
    }))
    .sort((a, b) => b.total - a.total);

  return {
    clients,
    weeklyTrend,
    categoryNames: [...categoryNames].sort(),
    categories,
  };
}

// since/until — то же окно, что выбрано в UI дашборда, для отчётов по
// времени ответа/решения — как по аккаунту в целом, так и по каждой
// категории (метке) отдельно, через родной отчёт Chatwoot (учитывает
// рабочие часы, переназначения и т.п.). Chatwoot-отчёты требуют оба конца
// диапазона — при "весь период" (since/until не заданы с UI) явно
// подставляем epoch..сейчас, иначе API отчётов молча возвращает нули.
async function getResponseTimeSummary(
  client,
  { since, until, categoryNames } = {}
) {
  const range = {
    since: since || 0,
    until: until || Math.floor(Date.now() / 1000),
  };
  const overall = await client.getReportSummary({ ...range, type: 'account' });

  let labels = [];
  try {
    labels = await client.listLabels();
  } catch (err) {
    console.error('[dashboard] listLabels failed:', err.message);
  }

  // Отчёты по меткам независимы — запрашиваем параллельно, а не по очереди.
  const results = await Promise.all(
    (categoryNames || []).map(async name => {
      const label = labels.find(l => l.title === name);
      if (!label) return null; // "Без категории" и т.п. — не настоящая метка
      try {
        const summary = await client.getReportSummary({
          ...range,
          type: 'label',
          id: label.id,
        });
        return { name, ...summary };
      } catch (err) {
        console.error(
          `[dashboard] getReportSummary(label=${name}) failed:`,
          err.message
        );
        return null;
      }
    })
  );
  const perCategory = results.filter(Boolean);

  return { range, overall, perCategory };
}

async function buildDashboardData(client, { since, until } = {}) {
  // Отчёт по типам проблем идёт прямым запросом в базу и от API не зависит —
  // запускаем параллельно с выкачкой бесед. Его падение не должно ронять
  // весь дашборд: остальные разделы считаются без него.
  const problemTypesPromise = getProblemTypeBreakdown({ since, until }).catch(
    err => {
      console.error('[dashboard] problem types failed:', err.message);
      return null;
    }
  );
  const operatorsPromise = getOperatorBreakdown({ since, until }).catch(err => {
    console.error('[dashboard] operators failed:', err.message);
    return null;
  });
  const conversations = await fetchConversations({ since, until });

  const { clients, weeklyTrend, categoryNames, categories } =
    aggregate(conversations);
  const responseTimes = await getResponseTimeSummary(client, {
    since,
    until,
    categoryNames,
  });

  return {
    generatedAt: new Date().toISOString(),
    range: { since: since || null, until: until || null },
    totalConversations: conversations.length,
    truncated: false,
    categoryNames,
    categories,
    clients,
    weeklyTrend,
    responseTimes,
    problemTypes: await problemTypesPromise,
    operators: await operatorsPromise,
  };
}

module.exports = { buildDashboardData, deriveCategory };
