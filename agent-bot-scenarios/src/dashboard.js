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

const MAX_PAGES = 40; // ~1000 диалогов при 25/страницу — защита от рантайма
// на очень больших аккаунтах; поднимите при необходимости.

function isoWeekStart(unixSeconds) {
  const d = new Date(unixSeconds * 1000);
  const day = (d.getUTCDay() + 6) % 7; // 0 = понедельник
  d.setUTCDate(d.getUTCDate() - day);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

async function fetchAllConversations(client) {
  const all = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const { payload } = await client.listConversations({ status: 'all', page });
    if (!payload || payload.length === 0) break;
    all.push(...payload);
    if (payload.length < 25) break; // последняя страница
  }
  return all;
}

function inRange(conv, since, until) {
  const ts = conv.created_at || 0;
  if (since && ts < since) return false;
  if (until && ts > until) return false;
  return true;
}

// Категория — метка сама по себе; сабкатегория — любая другая метка того же
// диалога вида "<категория>-...". Правило общее (не привязано жёстко к
// "finance"), поэтому подхватит новые подкатегории у любой другой категории
// метки без правок кода — ровно то, что обсуждали при добавлении
// ограничения видимости категорий для операторов.
function deriveCategory(labels) {
  const list = Array.isArray(labels) ? labels : labels ? [labels] : [];
  if (list.length === 0) return { category: 'Без категории', subcategory: null };

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

    if (!byCategory.has(category)) byCategory.set(category, { total: 0, subcategories: new Map() });
    const catEntry = byCategory.get(category);
    catEntry.total += 1;
    if (subcategory) {
      catEntry.subcategories.set(subcategory, (catEntry.subcategories.get(subcategory) || 0) + 1);
    }
  });

  const clients = [...byContact.values()].sort((a, b) => b.total - a.total);
  const weeklyTrend = [...byWeek.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const categories = [...byCategory.entries()]
    .map(([name, v]) => ({
      name,
      total: v.total,
      subcategories: [...v.subcategories.entries()].sort((a, b) => b[1] - a[1]),
    }))
    .sort((a, b) => b.total - a.total);

  return { clients, weeklyTrend, categoryNames: [...categoryNames].sort(), categories };
}

// since/until — то же окно, что выбрано в UI дашборда, для отчётов по
// времени ответа/решения — как по аккаунту в целом, так и по каждой
// категории (метке) отдельно, через родной отчёт Chatwoot (учитывает
// рабочие часы, переназначения и т.п.).
async function getResponseTimeSummary(client, { since, until, categoryNames } = {}) {
  const range = { since, until };
  const overall = await client.getReportSummary({ ...range, type: 'account' });

  let labels = [];
  try {
    labels = await client.listLabels();
  } catch (err) {
    console.error('[dashboard] listLabels failed:', err.message);
  }

  const perCategory = [];
  // eslint-disable-next-line no-restricted-syntax
  for (const name of categoryNames || []) {
    const label = labels.find(l => l.title === name);
    if (!label) continue; // "Без категории" и т.п. — не настоящая метка, пропускаем

    try {
      // eslint-disable-next-line no-await-in-loop
      const summary = await client.getReportSummary({ ...range, type: 'label', id: label.id });
      perCategory.push({ name, ...summary });
    } catch (err) {
      console.error(`[dashboard] getReportSummary(label=${name}) failed:`, err.message);
    }
  }

  return { range, overall, perCategory };
}

async function buildDashboardData(client, { since, until } = {}) {
  const allConversations = await fetchAllConversations(client);
  const conversations = since || until ? allConversations.filter(c => inRange(c, since, until)) : allConversations;

  const { clients, weeklyTrend, categoryNames, categories } = aggregate(conversations);
  const responseTimes = await getResponseTimeSummary(client, { since, until, categoryNames });

  return {
    generatedAt: new Date().toISOString(),
    range: { since: since || null, until: until || null },
    totalConversations: conversations.length,
    truncated: allConversations.length >= MAX_PAGES * 25,
    categoryNames,
    categories,
    clients,
    weeklyTrend,
    responseTimes,
  };
}

module.exports = { buildDashboardData, deriveCategory };
