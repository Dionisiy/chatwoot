// Агрегация данных для /dashboard из "сырого" списка диалогов
// (client.listConversations) + родных отчётов Chatwoot (getReportSummary).
//
// Разделение специально такое: то, чего в Chatwoot нет из коробки —
// "клиент × тема" и тренды по неделям — считаем сами из списка диалогов.
// То, что Chatwoot уже умеет правильно считать (среднее время ответа и
// решения, с учётом рабочих часов) — просто забираем через отчёты, а не
// пересчитываем вручную.

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

// "Клиент × тема" + тренд по неделям — из одного и того же набора диалогов,
// чтобы цифры в разных секциях дашборда не расходились между собой.
function aggregateByClientAndWeek(conversations) {
  const byContact = new Map();
  const byWeek = new Map();
  const teamNames = new Set();

  conversations.forEach(conv => {
    const contact = conv.meta && conv.meta.sender;
    const team = (conv.meta && conv.meta.team && conv.meta.team.name) || 'Без темы';
    teamNames.add(team);

    if (contact) {
      const key = contact.id;
      if (!byContact.has(key)) {
        byContact.set(key, {
          id: contact.id,
          name: contact.name || contact.email || `Контакт #${contact.id}`,
          email: contact.email || '',
          teams: new Map(),
          total: 0,
          lastTicketAt: 0,
        });
      }
      const entry = byContact.get(key);
      entry.teams.set(team, (entry.teams.get(team) || 0) + 1);
      entry.total += 1;
      entry.lastTicketAt = Math.max(entry.lastTicketAt, conv.created_at || 0);
    }

    const week = isoWeekStart(conv.created_at || Date.now() / 1000);
    if (!byWeek.has(week)) byWeek.set(week, new Map());
    const weekMap = byWeek.get(week);
    weekMap.set(team, (weekMap.get(team) || 0) + 1);
  });

  const clients = [...byContact.values()].sort((a, b) => b.total - a.total);
  const weeklyTrend = [...byWeek.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return { clients, weeklyTrend, teamNames: [...teamNames].sort() };
}

// since/until — окно для отчётов по времени ответа/решения (по умолчанию
// последние 90 дней), не влияет на "клиент × тема" (там берётся вся история).
async function getResponseTimeSummary(client, { since, until } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const range = {
    since: since || now - 90 * 24 * 60 * 60,
    until: until || now,
  };

  const overall = await client.getReportSummary({ ...range, type: 'account' });

  let teams = [];
  try {
    teams = await client.listTeams();
  } catch (err) {
    console.error('[dashboard] listTeams failed:', err.message);
  }

  const perTeam = [];
  // eslint-disable-next-line no-restricted-syntax
  for (const team of teams) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const summary = await client.getReportSummary({ ...range, type: 'team', id: team.id });
      perTeam.push({ name: team.name, ...summary });
    } catch (err) {
      console.error(`[dashboard] getReportSummary(team=${team.name}) failed:`, err.message);
    }
  }

  return { range, overall, perTeam };
}

async function buildDashboardData(client) {
  const conversations = await fetchAllConversations(client);
  const { clients, weeklyTrend, teamNames } = aggregateByClientAndWeek(conversations);
  const responseTimes = await getResponseTimeSummary(client);

  return {
    generatedAt: new Date().toISOString(),
    totalConversations: conversations.length,
    truncated: conversations.length >= MAX_PAGES * 25,
    teamNames,
    clients,
    weeklyTrend,
    responseTimes,
  };
}

module.exports = { buildDashboardData };
