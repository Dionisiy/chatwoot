const { Pool } = require('pg');

// Дерево сценария теперь живёт в той же Postgres, что и сам Chatwoot (см.
// db/schema.sql) — это единственный источник правды после отказа от
// flows.json, поэтому переменная обязательна: без неё бот не может отвечать
// вообще ни на одно сообщение, падать тихо смысла нет (см. общее правило
// проекта — misconfigured production state должен падать громко, а не
// молча деградировать).
if (!process.env.AGENT_BOT_DATABASE_URL) {
  throw new Error(
    'AGENT_BOT_DATABASE_URL не задан — без него бот не может прочитать дерево сценария (см. db/schema.sql, README).'
  );
}

const pool = new Pool({ connectionString: process.env.AGENT_BOT_DATABASE_URL });

module.exports = { pool };
