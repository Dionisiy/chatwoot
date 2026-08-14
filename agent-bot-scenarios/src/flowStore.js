const fs = require('fs');
const path = require('path');

// Единственный источник правды для дерева сценария — flows.json (раньше был
// flows.js с фабрикой requestForm, см. scripts/export-flows.js). Редактор
// /admin читает и пишет этот же файл через saveFlows(), после чего движок
// (engine.js вызывает getFlows() внутри каждого обработчика, а не хранит
// flows в константе на верхнем уровне модуля) сразу видит новую версию —
// без перезапуска pm2-процесса.

const FLOWS_PATH = path.join(__dirname, 'flows.json');

let cache = null;

function readFromDisk() {
  const raw = fs.readFileSync(FLOWS_PATH, 'utf8');
  return JSON.parse(raw);
}

function getFlows() {
  if (!cache) cache = readFromDisk();
  return cache;
}

// Сбросить кэш и перечитать с диска (на случай, если файл поменяли вручную,
// не через /admin — например, git pull забрал новую версию flows.json).
function reloadFlows() {
  cache = null;
  return getFlows();
}

const VALID_TYPES = ['menu', 'question', 'message', 'link', 'end', 'submit'];
const VALID_FIELD_TYPES = ['text', 'email', 'select'];

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

function saveFlows(newFlows) {
  const errors = validate(newFlows);
  if (errors.length) {
    const err = new Error('Дерево сценария невалидно');
    err.validationErrors = errors;
    throw err;
  }
  fs.writeFileSync(FLOWS_PATH, JSON.stringify(newFlows, null, 2) + '\n');
  cache = newFlows;
}

module.exports = { getFlows, reloadFlows, saveFlows, validate, FLOWS_PATH };
