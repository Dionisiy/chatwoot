// Рендер /dashboard в чистый HTML — без внешних CDN (Chart.js и т.п.),
// чтобы страница всегда открывалась, даже если у дроплета нет доступа в
// интернет. Тренд по неделям рисуем CSS-полосками, не canvas-графиками.

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '—';
  const s = Math.round(Number(seconds));
  if (s <= 0) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h > 0) return `${h} ч ${m} мин`;
  return `${m} мин`;
}

function formatDate(unixSeconds) {
  if (!unixSeconds) return '—';
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

function esc(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function renderClientsTable(clients, teamNames) {
  const rows = clients
    .map(c => {
      const teamCells = teamNames
        .map(t => `<td class="num">${c.teams.get(t) || ''}</td>`)
        .join('');
      return `<tr>
        <td>${esc(c.name)}${c.email ? `<br><span class="muted">${esc(c.email)}</span>` : ''}</td>
        ${teamCells}
        <td class="num total">${c.total}</td>
        <td>${formatDate(c.lastTicketAt)}</td>
      </tr>`;
    })
    .join('\n');

  const teamHeaders = teamNames.map(t => `<th>${esc(t)}</th>`).join('');

  return `<table>
    <thead><tr><th>Клиент</th>${teamHeaders}<th>Всего</th><th>Последняя заявка</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="99" class="muted">Нет диалогов</td></tr>'}</tbody>
  </table>`;
}

function renderWeeklyTrend(weeklyTrend, teamNames) {
  const max = weeklyTrend.reduce((m, [, teamMap]) => {
    const weekTotal = [...teamMap.values()].reduce((a, b) => a + b, 0);
    return Math.max(m, weekTotal);
  }, 1);

  const palette = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316'];
  const colorFor = i => palette[i % palette.length];

  const legend = teamNames
    .map((t, i) => `<span class="legend-item"><span class="swatch" style="background:${colorFor(i)}"></span>${esc(t)}</span>`)
    .join(' ');

  const rows = weeklyTrend
    .map(([week, teamMap]) => {
      const weekTotal = [...teamMap.values()].reduce((a, b) => a + b, 0);
      const bars = teamNames
        .map((t, i) => {
          const count = teamMap.get(t) || 0;
          if (!count) return '';
          const widthPct = (count / max) * 100;
          return `<span class="bar-segment" style="width:${widthPct}%;background:${colorFor(i)}" title="${esc(t)}: ${count}"></span>`;
        })
        .join('');
      return `<tr>
        <td class="muted">${week}</td>
        <td class="bar-cell"><div class="bar-track">${bars}</div></td>
        <td class="num">${weekTotal}</td>
      </tr>`;
    })
    .join('\n');

  return `<div class="legend">${legend}</div>
  <table class="trend-table">
    <tbody>${rows || '<tr><td colspan="99" class="muted">Нет данных</td></tr>'}</tbody>
  </table>`;
}

function renderResponseTimes(responseTimes) {
  const { overall, perTeam, range } = responseTimes;
  const teamRows = perTeam
    .map(
      t => `<tr>
        <td>${esc(t.name)}</td>
        <td class="num">${t.conversations_count ?? '—'}</td>
        <td class="num">${formatDuration(t.avg_first_response_time)}</td>
        <td class="num">${formatDuration(t.avg_resolution_time)}</td>
      </tr>`
    )
    .join('\n');

  return `<p class="muted">За период ${formatDate(range.since)} — ${formatDate(range.until)}
    (последние 90 дней; данные — родные отчёты Chatwoot, с учётом рабочих часов).</p>
  <table>
    <thead><tr><th>Команда</th><th>Диалогов</th><th>Ср. время ответа</th><th>Ср. время решения</th></tr></thead>
    <tbody>
      <tr class="total-row">
        <td>Всего по аккаунту</td>
        <td class="num">${overall.conversations_count ?? '—'}</td>
        <td class="num">${formatDuration(overall.avg_first_response_time)}</td>
        <td class="num">${formatDuration(overall.avg_resolution_time)}</td>
      </tr>
      ${teamRows || '<tr><td colspan="99" class="muted">Команды не созданы</td></tr>'}
    </tbody>
  </table>`;
}

function renderDashboardHtml(data) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>SlideEdu — статистика заявок</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; padding: 24px 32px; background: #f8fafc; color: #0f172a; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  h2 { font-size: 15px; margin: 32px 0 12px; color: #334155; }
  .meta { color: #64748b; font-size: 13px; margin-bottom: 24px; }
  section { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 20px; margin-bottom: 20px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { padding: 6px 10px; border-bottom: 1px solid #eef2f7; text-align: left; }
  th { color: #64748b; font-weight: 600; font-size: 12px; text-transform: uppercase; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.total { font-weight: 600; }
  tr.total-row { font-weight: 600; background: #f8fafc; }
  .muted { color: #94a3b8; font-size: 12px; }
  .bar-cell { width: 50%; }
  .bar-track { display: flex; height: 14px; background: #f1f5f9; border-radius: 3px; overflow: hidden; }
  .bar-segment { height: 100%; }
  .legend { margin-bottom: 8px; font-size: 12px; color: #475569; }
  .legend-item { margin-right: 12px; white-space: nowrap; }
  .swatch { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 4px; }
  .warn { color: #b45309; font-size: 12px; margin-top: 8px; }
  a.refresh { font-size: 12px; }
</style>
</head>
<body>
  <h1>Статистика заявок SlideEdu</h1>
  <div class="meta">
    Сформировано: ${data.generatedAt} · Всего диалогов в выборке: ${data.totalConversations}
    ${data.truncated ? '<span class="warn">— выборка ограничена (очень много диалогов), см. MAX_PAGES в src/dashboard.js</span>' : ''}
    · <a class="refresh" href="/dashboard">обновить</a>
  </div>

  <section>
    <h2>Клиент × тема (все заявки за всё время)</h2>
    ${renderClientsTable(data.clients, data.teamNames)}
  </section>

  <section>
    <h2>Среднее время ответа и решения</h2>
    ${renderResponseTimes(data.responseTimes)}
  </section>

  <section>
    <h2>Тренд заявок по неделям (по темам)</h2>
    ${renderWeeklyTrend(data.weeklyTrend, data.teamNames)}
  </section>
</body>
</html>`;
}

module.exports = { renderDashboardHtml };
