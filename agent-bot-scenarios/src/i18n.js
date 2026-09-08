// Мультиязычность сценария.
//
// Любой текст узла (title, prompt, text, message, linkTitle, options[].title)
// может быть либо обычной строкой, либо объектом с языками:
//
//   prompt: "Укажите ФИО"                        // как было
//   prompt: { ru: "Укажите ФИО", uk: "Вкажіть ПІБ", en: "Full name" }
//
// Обе формы работают одновременно и навсегда: строка = русский текст без
// переводов. Это принципиально — иначе переход на мультиязычность требовал бы
// одномоментной миграции всех 90 узлов живого сценария, а любая пропущенная
// строка роняла бы бота посреди диалога у реального клиента. Здесь же
// непереведённый узел просто отвечает по-русски.

const LOCALES = ['ru', 'uk', 'en'];
const DEFAULT_LOCALE = 'ru';

// 'uk-UA' → 'uk', 'RU' → 'ru', мусор/пусто → null (решение о запасном языке
// принимает вызывающий, а не эта функция).
function normalizeLocale(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const code = raw.trim().toLowerCase().split(/[-_]/)[0];
  return LOCALES.includes(code) ? code : null;
}

function isLocalized(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    LOCALES.some(code => typeof value[code] === 'string')
  );
}

// Достать текст на нужном языке. Порядок запасных вариантов: запрошенный язык
// → русский (язык оригинала, на нём написан весь сценарий) → любой
// непустой. Последний шаг нужен для узлов, которые в редакторе завели сразу
// на украинском и забыли русский: показать хоть что-то лучше, чем пустое
// сообщение, на которое виджет ответит ошибкой отправки.
function t(value, locale = DEFAULT_LOCALE) {
  if (!isLocalized(value)) return value;
  const code = normalizeLocale(locale) || DEFAULT_LOCALE;
  const candidates = [code, DEFAULT_LOCALE, ...LOCALES];
  const found = candidates.find(c => value[c] && value[c].trim());
  return found ? value[found] : '';
}

// Служебные надписи самого движка — кнопки навигации, подтверждения, ошибки
// валидации. В дереве сценария их нет и быть не должно: они не относятся к
// конкретной ветке и одинаковы для всех 90 узлов, поэтому живут в коде
// (аналог widget/i18n/locale/*.json на стороне виджета).
const UI = {
  BACK: { ru: '« Назад', uk: '« Назад', en: '« Back' },
  MENU: {
    ru: '🏠 Главное меню',
    uk: '🏠 Головне меню',
    en: '🏠 Main menu',
  },
  SKIP: { ru: 'Пропустить', uk: 'Пропустити', en: 'Skip' },
  TICKET_NUMBER: {
    ru: 'Номер заявки',
    uk: 'Номер заявки',
    en: 'Ticket number',
  },
  INVALID_EMAIL: {
    ru: 'Похоже, это не email. Укажите адрес в формате name@example.com',
    uk: 'Схоже, це не email. Вкажіть адресу у форматі name@example.com',
    en: 'That does not look like an email. Use the format name@example.com',
  },
  ATTACHMENT_RECEIVED: {
    ru: 'Файл получен. Чтобы продолжить, ответьте, пожалуйста, на вопрос выше.',
    uk: 'Файл отримано. Щоб продовжити, дайте, будь ласка, відповідь на питання вище.',
    en: 'File received. Please answer the question above to continue.',
  },
};

function ui(key, locale) {
  return t(UI[key], locale);
}

// Текстовые команды, которыми клиент может управлять сценарием вместо кнопок
// (см. engine.js#handleTextAnswer). Сравнение идёт по всем языкам сразу, а не
// только по текущему: клиент мог переключить язык виджета посреди диалога.
const TEXT_COMMANDS = {
  menu: ['меню', 'главное меню', 'головне меню', 'menu', 'main menu'],
  back: ['назад', 'back'],
};

function matchTextCommand(trimmedLower) {
  const entry = Object.entries(TEXT_COMMANDS).find(([, words]) =>
    words.includes(trimmedLower)
  );
  return entry ? entry[0] : null;
}

module.exports = {
  LOCALES,
  DEFAULT_LOCALE,
  normalizeLocale,
  isLocalized,
  t,
  ui,
  matchTextCommand,
};
