// Персональная статистика операторов для дашборда: кто сколько бесед закрыл,
// в каких категориях и с какими типами проблем, сколько бесед вёл и сколько
// сообщений отправил.
//
// «Кто закрыл» — это тот, кто реально перевёл беседу в «Решено», а не
// назначенный оператор. Штатные отчёты Chatwoot берут назначенного
// (ReportingEvent.user_id = assignee_id), а у SlideEdu бот назначает команду,
// а не человека: из 236 закрытых бесед назначенный был у 9.
//
// Источник — служебные сообщения о смене статуса: одно сообщение на каждое
// закрытие, так что повторное закрытие после переоткрытия тоже считается.
// С правки ActivityMessageHandler#status_change_actor автор пишется в
// content_attributes.activity (actor_type/actor_id). У более старых
// сообщений его там нет — восстанавливаем по тексту: шаблоны известны
// (config/locales/*.yml → conversations.activity.status) на всех трёх языках.
const { pool } = require('./db');

// Тексты «X завершил диалог» — оператор или бот (user_name).
const ACTOR_RESOLVED_PATTERNS = [
  /^Conversation was marked resolved by (.+)$/,
  /^(.+) завершил диалог$/,
  /^Розмова була відмічена як вирішена (.+)$/,
];
// Тексты «закрыто клиентом» (contact_name) и «закрыто системой».
const CONTACT_RESOLVED_PATTERNS = [
  /^Conversation was resolved by /,
  /^Разговор был закрыт /,
  /^Діалог був закритий /,
];

const OTHER_BUCKETS = {
  Contact: 'Клиент (закрыл сам)',
  AgentBot: 'Бот',
  AutomationRule: 'Автоматизация',
  System: 'Система (по неактивности)',
};

// Категория — главная метка (finance-payment → finance), как в остальных
// разделах дашборда.
function categoryOf(labels, allTitles) {
  const roots = labels
    .map(
      title =>
        allTitles
          .filter(c => title === c || title.startsWith(`${c}-`))
          .sort((a, b) => a.length - b.length)[0]
    )
    .filter(Boolean);
  return roots[0] || 'Без категории';
}

function resolveActor(row, usersByName, botNames) {
  const activity = row.activity || {};
  if (activity.actor_type) {
    return { type: activity.actor_type, id: activity.actor_id };
  }

  const content = (row.content || '').trim();
  const actorName = ACTOR_RESOLVED_PATTERNS.map(re => content.match(re)).find(
    Boolean
  )?.[1];
  if (actorName) {
    const user = usersByName.get(actorName.toLowerCase());
    if (user) return { type: 'User', id: user.id };
    if (botNames.has(actorName.toLowerCase())) return { type: 'AgentBot' };
    if (/^(Система автоматизации|Automation System)$/i.test(actorName)) {
      return { type: 'AutomationRule' };
    }
  }
  if (CONTACT_RESOLVED_PATTERNS.some(re => re.test(content))) {
    return { type: 'Contact' };
  }
  return { type: 'System' };
}

const bump = (map, key) => map.set(key, (map.get(key) || 0) + 1);

async function getOperatorBreakdown({ since, until } = {}) {
  const accountId = process.env.CHATWOOT_ACCOUNT_ID;
  const range = [accountId, since || null, until || null];
  const inRange =
    column => `($2::bigint IS NULL OR ${column} >= to_timestamp($2))
        AND ($3::bigint IS NULL OR ${column} <= to_timestamp($3))`;

  const [users, bots, labels, resolves, replies] = await Promise.all([
    pool.query(
      `SELECT u.id, u.name FROM users u
         JOIN account_users au ON au.user_id = u.id AND au.account_id = $1`,
      [accountId]
    ),
    pool.query('SELECT name FROM agent_bots'),
    pool.query('SELECT title FROM labels WHERE account_id = $1', [accountId]),
    // Закрытия за период — по времени самого закрытия, а не создания беседы.
    pool.query(
      `SELECT m.content,
              ((m.content_attributes #>> '{}')::jsonb -> 'activity') AS activity,
              c.cached_label_list, pt.name AS problem_type
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         LEFT JOIN problem_types pt ON pt.id = c.problem_type_id
        WHERE m.account_id = $1
          AND m.message_type = 2
          AND (m.content_attributes #>> '{}')::jsonb #>> '{activity,status}' = 'resolved'
          AND ${inRange('m.created_at')}`,
      range
    ),
    // Ответы клиентам: публичные исходящие сообщения операторов.
    pool.query(
      `SELECT sender_id, count(*)::int AS messages,
              count(DISTINCT conversation_id)::int AS conversations
         FROM messages
        WHERE account_id = $1 AND message_type = 1 AND sender_type = 'User'
          AND private = false
          AND ${inRange('created_at')}
        GROUP BY sender_id`,
      range
    ),
  ]);

  const usersByName = new Map(users.rows.map(u => [u.name.toLowerCase(), u]));
  const botNames = new Set(bots.rows.map(b => b.name.toLowerCase()));
  const allTitles = labels.rows.map(l => l.title);

  // id оператора -> статистика; заводим всех операторов аккаунта, чтобы
  // в таблице были видны и те, кто за период ничего не закрыл.
  const operators = new Map(
    users.rows.map(u => [
      u.id,
      {
        id: u.id,
        name: u.name,
        resolved: 0,
        conversations: 0,
        messages: 0,
        categories: new Map(), // категория -> { total, problemTypes: Map }
      },
    ])
  );
  const others = new Map(); // подпись -> число закрытий

  resolves.rows.forEach(row => {
    const actor = resolveActor(row, usersByName, botNames);
    const operator = actor.type === 'User' && operators.get(Number(actor.id));
    if (!operator) {
      bump(others, OTHER_BUCKETS[actor.type] || OTHER_BUCKETS.System);
      return;
    }
    operator.resolved += 1;
    const labelList = (row.cached_label_list || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const category = categoryOf(labelList, allTitles);
    if (!operator.categories.has(category)) {
      operator.categories.set(category, { total: 0, problemTypes: new Map() });
    }
    const entry = operator.categories.get(category);
    entry.total += 1;
    bump(entry.problemTypes, row.problem_type || 'Не указано');
  });

  replies.rows.forEach(row => {
    const operator = operators.get(row.sender_id);
    if (!operator) return; // оператор удалён из аккаунта
    operator.messages = row.messages;
    operator.conversations = row.conversations;
  });

  const byCount = (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]);
  return {
    operators: [...operators.values()]
      .map(op => ({
        ...op,
        categories: [...op.categories.entries()]
          .map(([name, v]) => ({
            name,
            total: v.total,
            problemTypes: [...v.problemTypes.entries()].sort(byCount),
          }))
          .sort((a, b) => b.total - a.total),
      }))
      .sort(
        (a, b) =>
          b.resolved - a.resolved ||
          b.conversations - a.conversations ||
          a.name.localeCompare(b.name)
      ),
    others: [...others.entries()].sort(byCount),
  };
}

module.exports = { getOperatorBreakdown, resolveActor };
