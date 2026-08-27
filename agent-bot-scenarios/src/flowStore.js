const { pool } = require('./db');

// Единственный источник правды для дерева сценария — таблица
// agent_bot_flow_versions в Postgres (см. db/schema.sql), а не файл на диске:
// раньше это был flows.json, который жил вне git (см. README/CLAUDE.md),
// требовал ручного бэкапа перед переключением веток на дропле и не имел
// истории изменений вообще — правка поверх правки без возможности
// посмотреть, что было раньше, или откатиться. Каждое сохранение из /admin —
// это НОВАЯ строка (append-only), "текущая" версия — просто строка с
// максимальным id; история версий получается бесплатно, без отдельной
// таблицы.
//
// getFlows() остаётся СИНХРОННОЙ функцией, как и раньше — engine.js вызывает
// её внутри каждого обработчика без await в паре десятков мест, и это менять
// не требуется: она читает in-memory кэш, а не базу напрямую. Кэш заполняется
// один раз при старте процесса (см. init(), вызывается из server.js ДО
// app.listen()) и обновляется при каждом saveFlows()/reloadFlows().

let cache = null;

async function loadCurrentFromDb() {
  const { rows } = await pool.query(
    'SELECT content FROM agent_bot_flow_versions ORDER BY id DESC LIMIT 1'
  );
  if (!rows.length) {
    throw new Error(
      'agent_bot_flow_versions пуста — нужно один раз засеять текущим деревом сценария (см. db/seed-from-json.js, README).'
    );
  }
  return rows[0].content;
}

// Вызывается один раз при старте процесса, ДО того как сервер начнёт
// принимать вебхуки — иначе getFlows() упадёт на пустом кэше на первом же
// сообщении.
async function init() {
  cache = await loadCurrentFromDb();
  return cache;
}

function getFlows() {
  if (!cache) {
    throw new Error('flowStore.init() ещё не вызван (или упал) — кэш дерева сценария пуст.');
  }
  return cache;
}

// Перечитать текущую версию из базы, сбросив кэш — на случай прямой правки
// записи в БД в обход /admin (аналог старого «git pull забрал новый
// flows.json»). Дергается вручную через GET /admin/api/flows.
async function reloadFlows() {
  cache = await loadCurrentFromDb();
  return cache;
}

const VALID_TYPES = ['menu', 'question', 'message', 'link', 'end', 'submit'];
const VALID_FIELD_TYPES = ['text', 'email', 'select', 'date', 'student_select'];

// Возвращает массив текстовых ошибок (пустой массив = дерево валидно).
// Не бросает исключений сама — так проще показать все ошибки разом в UI,
// а не чинить их по одной через повторные попытки сохранить.
function validate(flows) {
  const errors = [];
  if (!flows || typeof flows !== 'object' || Array.isArray(flows)) {
    return ['Дерево должно быть объектом { id_узла: узел, ... }'];
  }
  if (!flows.main_menu) errors.push('Отсутствует обязательный корневой узел main_menu');

  const ids = new Set(Object.keys(flows));
  const checkRef = (nextId, where) => {
    if (nextId && !ids.has(nextId)) errors.push(`${where}: ссылка на несуществующий узел "${nextId}"`);
  };

  Object.entries(flows).forEach(([id, node]) => {
    if (!node || typeof node !== 'object') {
      errors.push(`${id}: узел должен быть объектом`);
      return;
    }
    if (!VALID_TYPES.includes(node.type)) {
      errors.push(`${id}: неизвестный type "${node.type}" (допустимо: ${VALID_TYPES.join(', ')})`);
      return;
    }

    if (node.type === 'menu') {
      if (!node.title) errors.push(`${id}: menu без title`);
      if (!Array.isArray(node.options) || !node.options.length) {
        errors.push(`${id}: menu без options`);
      } else {
        node.options.forEach((o, i) => {
          if (!o.id) errors.push(`${id}.options[${i}]: нет id`);
          if (!o.title) errors.push(`${id}.options[${i}]: нет title`);
          checkRef(o.next, `${id}.options[${i}].next`);
        });
      }
    } else if (node.type === 'question') {
      if (!node.prompt) errors.push(`${id}: question без prompt`);
      if (!node.field || !node.field.name) errors.push(`${id}: question без field.name`);
      if (node.field && node.field.type && !VALID_FIELD_TYPES.includes(node.field.type)) {
        errors.push(`${id}: field.type "${node.field.type}" не поддерживается (допустимо: ${VALID_FIELD_TYPES.join(', ')})`);
      }
      if (node.field && node.field.type === 'select' && (!Array.isArray(node.field.options) || !node.field.options.length)) {
        errors.push(`${id}: field.type=select без field.options`);
      }
      checkRef(node.next, `${id}.next`);
    } else if (node.type === 'message') {
      if (!node.text) errors.push(`${id}: message без text`);
      checkRef(node.next, `${id}.next`);
    } else if (node.type === 'link') {
      if (!node.text) errors.push(`${id}: link без text`);
    } else if (node.type === 'end') {
      if (!node.text) errors.push(`${id}: end без text`);
    } else if (node.type === 'submit') {
      if (!node.message) errors.push(`${id}: submit без message`);
    }
  });

  return errors;
}

// createdBy — имя/email администратора, сохранившего эту версию (см.
// chatwootClient.js#getProfile, вызывается из server.js на POST
// /admin/api/flows) — необязателен, история версий полезна и без него, но с
// ним по-настоящему видно, кто и когда правил сценарий.
async function saveFlows(newFlows, { createdBy } = {}) {
  const errors = validate(newFlows);
  if (errors.length) {
    const err = new Error('Дерево сценария невалидно');
    err.validationErrors = errors;
    throw err;
  }
  await pool.query(
    'INSERT INTO agent_bot_flow_versions (content, created_by) VALUES ($1, $2)',
    [newFlows, createdBy || null]
  );
  cache = newFlows;
  return newFlows;
}

// Список версий БЕЗ содержимого (content может быть тяжёлым деревом) — для
// списка в /admin. limit ограничивает на случай, если версий накопится
// действительно много (каждое сохранение — новая строка).
async function listVersions(limit = 50) {
  const { rows } = await pool.query(
    'SELECT id, created_at, created_by FROM agent_bot_flow_versions ORDER BY id DESC LIMIT $1',
    [limit]
  );
  return rows;
}

// Полное содержимое одной версии — для предпросмотра/отката.
async function getVersion(id) {
  const { rows } = await pool.query(
    'SELECT id, content, created_at, created_by FROM agent_bot_flow_versions WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

module.exports = {
  init,
  getFlows,
  reloadFlows,
  saveFlows,
  listVersions,
  getVersion,
  validate,
};
