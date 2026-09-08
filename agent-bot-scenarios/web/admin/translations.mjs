// Сбор всех переводимых текстов сценария в один плоский список.
//
// Зачем отдельный экран, а не поля в карточке узла: узлов около сотни, они
// разбросаны по пяти веткам, и переводчику пришлось бы обойти каждый, помня,
// где он уже был. Плоский список с колонкой «оригинал → перевод» решает
// ровно эту задачу и заодно честно показывает, сколько осталось.
//
// Формат хранения — тот же, что читает движок бота (см. src/i18n.js):
// строка = русский текст без переводов, объект { ru, uk, en } = текст с
// переводами. Обе формы валидны и допустимы вперемешку в одном дереве,
// поэтому перевод можно вести постепенно, ничего не ломая.

export const BASE_LOCALE = 'ru';
export const TARGET_LOCALES = [
  { code: 'uk', label: 'Українська' },
  { code: 'en', label: 'English' },
];

// Текст на языке locale: строка отдаётся как русский оригинал, объект — по
// ключу. Пусто, если перевода нет (именно это и подсвечивает прогресс).
export function readLocale(value, locale) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return locale === BASE_LOCALE ? value : '';
  return value[locale] || '';
}

// Русский оригинал — то, с чего переводчик переводит.
export function readBase(value) {
  return readLocale(value, BASE_LOCALE);
}

// Записать перевод, вернув НОВОЕ значение поля.
//
// Пустой перевод стирает ключ, а значение с одним только русским схлопывается
// обратно в обычную строку — чтобы «перевёл и передумал» не оставляло в
// дереве объектов-однодневок { ru: "…" }, которые ничем не отличаются от
// строки, но раздувают JSON и диффы в истории версий.
export function writeLocale(value, locale, text) {
  const trimmed = text.trim();
  const next = { ru: readBase(value) };
  if (typeof value === 'object' && value !== null) Object.assign(next, value);
  if (trimmed) next[locale] = trimmed;
  else delete next[locale];

  const translated = Object.keys(next).some(k => k !== BASE_LOCALE);
  return translated ? next : next.ru;
}

// Правка русского оригинала в обычном редакторе узла — переводы при этом
// должны уцелеть, поэтому объект не заменяется строкой. Здесь, в отличие от
// writeLocale, текст НЕ обрезается: поле редактируется по мере набора, и
// trim() не дал бы поставить пробел между словами.
export function writeBase(value, text) {
  if (typeof value === 'object' && value !== null)
    return { ...value, ru: text };
  return text;
}

// Есть ли у текста переводы (для подсказки в редакторе узла).
export function hasTranslations(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.keys(value).some(k => k !== BASE_LOCALE && value[k])
  );
}

// Один переводимый текст: как его прочитать, как записать и как назвать на
// экране. Через замыкания, а не через путь-строку: у подписей вариантов
// ответа хранилище (field.optionTitles) может ещё не существовать, и
// создавать его заранее для всех select-узлов означало бы менять дерево
// самим фактом открытия экрана переводов.
function entry(nodeId, label, get, set) {
  return { id: `${nodeId}.${label}`, nodeId, label, get, set };
}

function fieldEntry(nodeId, owner, key, label) {
  return entry(
    nodeId,
    label,
    () => owner[key],
    value => {
      owner[key] = value;
    }
  );
}

// Подпись варианта ответа. Оригинал по умолчанию — само значение варианта
// (так оно и показывается клиенту, пока перевода нет), поэтому запись
// «только русский» означает «переводов нет» и ключ удаляется целиком.
function optionEntry(nodeId, field, value) {
  return entry(
    nodeId,
    `вариант «${value}»`,
    () => field.optionTitles?.[value] ?? value,
    next => {
      if (typeof next === 'string') {
        if (field.optionTitles) delete field.optionTitles[value];
        if (field.optionTitles && !Object.keys(field.optionTitles).length) {
          delete field.optionTitles;
        }
        return;
      }
      if (!field.optionTitles) field.optionTitles = {};
      field.optionTitles[value] = next;
    }
  );
}

// Порядок обхода — как в дереве: сначала сам узел, потом его варианты. Так
// строки на экране идут в том же порядке, в каком клиент увидит их в чате.
export function collectEntries(flows) {
  const entries = [];

  Object.entries(flows).forEach(([nodeId, node]) => {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'menu') {
      entries.push(fieldEntry(nodeId, node, 'title', 'заголовок меню'));
      (node.options || []).forEach((option, i) => {
        entries.push(fieldEntry(nodeId, option, 'title', `кнопка ${i + 1}`));
      });
    } else if (node.type === 'question') {
      entries.push(fieldEntry(nodeId, node, 'prompt', 'вопрос'));
      // Подписи вариантов ответа. Само значение (оно уходит в заявку и
      // служит ключом) не трогаем — переводим только надпись на кнопке,
      // см. flowStore.js#checkOptionTitles.
      if (node.field?.type === 'select') {
        (node.field.options || []).forEach(value => {
          entries.push(optionEntry(nodeId, node.field, value));
        });
      }
    } else if (node.type === 'message') {
      entries.push(fieldEntry(nodeId, node, 'text', 'сообщение'));
    } else if (node.type === 'link') {
      entries.push(fieldEntry(nodeId, node, 'text', 'текст'));
      if (node.url) {
        entries.push(fieldEntry(nodeId, node, 'linkTitle', 'подпись ссылки'));
      }
    } else if (node.type === 'end') {
      entries.push(fieldEntry(nodeId, node, 'text', 'завершение'));
    } else if (node.type === 'submit') {
      entries.push(fieldEntry(nodeId, node, 'message', 'подтверждение заявки'));
    }
  });

  return entries;
}
