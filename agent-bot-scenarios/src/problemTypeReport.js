// Отчёт «типы проблем по главным меткам» для дашборда статистики.
//
// Считается прямым запросом в базу Chatwoot (бот подключён к ней же, см.
// db.js): тип проблемы — отдельная колонка беседы, которой нет в API списка
// бесед, а выкачивать все беседы постранично ради одного поля незачем.
//
// Что попадает в отчёт:
//   • беседы с выбранным типом — в свою метку и тип, независимо от статуса;
//   • ЗАКРЫТЫЕ беседы без типа — в «Не определено» своей главной метки. Это те,
//     что закрыл клиент или автоматика (оператору закрыть без типа не даст
//     Chatwoot). Открытые беседы без типа не считаются: их ещё не разобрали,
//     и в «Не определено» они бы только раздували статистику.
//   • беседы без главной метки в отчёт не попадают — для них типов нет.
//   • у финансов типов нет вовсе (см. ProblemTypes::RootLabels::EXEMPT):
//     классификацию там дают подметки finance-*. Закрытые финансовые беседы
//     поэтому целиком идут в «Не определено» метки finance.
const { pool } = require('./db');

const UNSPECIFIED = 'Не определено';
const RESOLVED = 1; // Conversation.statuses[:resolved]

// Копия правила главной метки из Chatwoot (ProblemTypes::RootLabels и
// app/javascript/dashboard/helper/problemTypes.js): метка — подметка, если
// начинается с названия другой существующей метки и дефиса.
function rootLabelOf(title, allTitles) {
  return (
    allTitles
      .filter(c => title === c || title.startsWith(`${c}-`))
      .sort((a, b) => a.length - b.length)[0] || null
  );
}

async function getProblemTypeBreakdown({ since, until } = {}) {
  const accountId = process.env.CHATWOOT_ACCOUNT_ID;

  const [{ rows: labelRows }, { rows }] = await Promise.all([
    pool.query('SELECT title FROM labels WHERE account_id = $1', [accountId]),
    pool.query(
      `SELECT c.status, c.cached_label_list, pt.label_title, pt.name
         FROM conversations c
         LEFT JOIN problem_types pt ON pt.id = c.problem_type_id
        WHERE c.account_id = $1
          AND ($2::bigint IS NULL OR c.created_at >= to_timestamp($2))
          AND ($3::bigint IS NULL OR c.created_at <= to_timestamp($3))`,
      [accountId, since || null, until || null]
    ),
  ]);
  const allTitles = labelRows.map(r => r.title);

  // label -> Map(typeName -> count)
  const byLabel = new Map();
  const bump = (label, name) => {
    if (!byLabel.has(label)) byLabel.set(label, new Map());
    const types = byLabel.get(label);
    types.set(name, (types.get(name) || 0) + 1);
  };

  rows.forEach(row => {
    if (row.label_title) {
      bump(row.label_title, row.name);
      return;
    }
    if (row.status !== RESOLVED) return;
    const labels = (row.cached_label_list || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const roots = [
      ...new Set(labels.map(l => rootLabelOf(l, allTitles)).filter(Boolean)),
    ];
    roots.forEach(root => bump(root, UNSPECIFIED));
  });

  // Та же форма, что у категорий (CategoryBreakdown.vue):
  // [{ name, total, subcategories: [[name, count], ...] }], «Не определено» — в конце.
  return [...byLabel.entries()]
    .map(([name, types]) => ({
      name,
      total: [...types.values()].reduce((a, b) => a + b, 0),
      subcategories: [...types.entries()].sort((a, b) => {
        if (a[0] === UNSPECIFIED) return 1;
        if (b[0] === UNSPECIFIED) return -1;
        return b[1] - a[1] || a[0].localeCompare(b[0]);
      }),
    }))
    .sort((a, b) => b.total - a.total);
}

module.exports = { getProblemTypeBreakdown, rootLabelOf };
