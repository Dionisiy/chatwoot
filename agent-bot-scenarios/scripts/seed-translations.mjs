// Черновой перевод текстов сценария на украинский и английский.
//
// Разовый скрипт: читает текущую версию дерева из agent_bot_flow_versions,
// проставляет переводы по карте ниже и сохраняет НОВОЙ версией — то есть
// ровно так же, как обычное сохранение из /admin, с полным откатом через
// «История» и без единого изменения в живом сценарии до момента запуска.
//
// Карта — по русскому оригиналу, а не по id узла: одни и те же строки
// («Укажите вашу должность», «Ваша заявка создана…») встречаются в 5–11
// ветках, и переводить их по одной значило бы гарантированно получить
// расхождения между ветками.
//
// Переводы черновые и требуют вычитки — для этого в /admin есть экран
// «Переводы», где видно оригинал и перевод рядом.
//
// Запуск: node scripts/seed-translations.mjs [--dry]

import { readFileSync, writeFileSync } from 'fs';
import pg from 'pg';
import {
  collectEntries,
  readBase,
  writeLocale,
} from '../web/admin/translations.mjs';

const TRANSLATIONS = {
  // --- главное меню и разделы ---
  'Добрый день, выберите вариант': {
    uk: 'Доброго дня, оберіть варіант',
    en: 'Hello, please choose an option',
  },
  'Запись на консультацию': {
    uk: 'Запис на консультацію',
    en: 'Book a consultation',
  },
  'Проблема с платежами': {
    uk: 'Проблема з платежами',
    en: 'Payment problem',
  },
  'Вопросы по ведению ФОП': {
    uk: 'Питання щодо ведення ФОП',
    en: 'Sole proprietorship (FOP) questions',
  },
  'Получение финансовых документов': {
    uk: 'Отримання фінансових документів',
    en: 'Financial documents',
  },
  'Общие финансовые вопросы': {
    uk: 'Загальні фінансові питання',
    en: 'General billing questions',
  },

  // --- запись на консультацию ---
  'Открыть ФОП': { uk: 'Відкрити ФОП', en: 'Register a sole proprietorship' },
  'Закрыть ФОП': { uk: 'Закрити ФОП', en: 'Close a sole proprietorship' },
  'Подбор реквизитов': {
    uk: 'Підбір реквізитів',
    en: 'Choosing payment details',
  },
  'Прошли ли вы обучение на платформе THI: "Как открыть ФОП и как оплачивать налоги"?':
    {
      uk: 'Чи пройшли ви навчання на платформі THI: «Як відкрити ФОП і як сплачувати податки»?',
      en: 'Have you completed the THI course “How to register a sole proprietorship and pay taxes”?',
    },
  Да: { uk: 'Так', en: 'Yes' },
  Нет: { uk: 'Ні', en: 'No' },
  'Обратитесь к вашему куратору, чтобы пройти обучение перед записью на консультацию.':
    {
      uk: 'Зверніться до вашого куратора, щоб пройти навчання перед записом на консультацію.',
      en: 'Please contact your curator to complete the course before booking a consultation.',
    },
  'Перейдите в календарь и заполните форму\n[Календарь](https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ3gUGIZzmqXQJSoKF17dxYwZlq7ALOyRR4FdLxbPWBvQb6PaAy8RpKXHl3SaRQ9JJLrUZwbrr6u)':
    {
      uk: 'Перейдіть до календаря і заповніть форму\n[Календар](https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ3gUGIZzmqXQJSoKF17dxYwZlq7ALOyRR4FdLxbPWBvQb6PaAy8RpKXHl3SaRQ9JJLrUZwbrr6u)',
      en: 'Open the calendar and fill in the form\n[Calendar](https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ3gUGIZzmqXQJSoKF17dxYwZlq7ALOyRR4FdLxbPWBvQb6PaAy8RpKXHl3SaRQ9JJLrUZwbrr6u)',
    },

  // --- проблемы с платежами ---
  'Поступила неправильная сумма ЗП': {
    uk: 'Надійшла неправильна сума зарплати',
    en: 'Incorrect salary amount received',
  },
  'Не учтен бонус': { uk: 'Не враховано бонус', en: 'Bonus not included' },
  'Выберите валюту в которой была начислена сумма': {
    uk: 'Оберіть валюту, у якій було нараховано суму',
    en: 'Select the currency the amount was paid in',
  },
  Злотые: { uk: 'Злоті', en: 'Zloty' },
  Доллар: { uk: 'Долар', en: 'Dollar' },
  Гривна: { uk: 'Гривня', en: 'Hryvnia' },
  'Напишите фактическую сумму начисления': {
    uk: 'Напишіть фактичну суму нарахування',
    en: 'Enter the amount you actually received',
  },
  'Напишите сколько должны были получить по отчёту?': {
    uk: 'Напишіть, скільки мали отримати за звітом',
    en: 'Enter the amount you were supposed to receive according to the report',
  },
  'Напишите сумму начисления': {
    uk: 'Напишіть суму нарахування',
    en: 'Enter the amount',
  },
  'По какому проекту?': { uk: 'За яким проєктом?', en: 'Which project?' },

  // --- финансовые документы ---
  'Справка о доходах': { uk: 'Довідка про доходи', en: 'Income certificate' },
  'Оформление инвойса': { uk: 'Оформлення інвойсу', en: 'Invoice request' },
  'Выписка ЗП за период': {
    uk: 'Виписка щодо зарплати за період',
    en: 'Salary statement for a period',
  },
  'За какой период нужна справка?': {
    uk: 'За який період потрібна довідка?',
    en: 'What period should the certificate cover?',
  },
  'Куда предоставляется справка?': {
    uk: 'Куди надається довідка?',
    en: 'Who is the certificate for?',
  },
  'Укажите сумму инвойса': {
    uk: 'Вкажіть суму інвойсу',
    en: 'Enter the invoice amount',
  },
  'Укажите реквизиты для инвойса': {
    uk: 'Вкажіть реквізити для інвойсу',
    en: 'Enter the payment details for the invoice',
  },

  // --- общие поля анкеты ---
  'Нужно заполнить данные для подачи заявки': {
    uk: 'Потрібно заповнити дані для подання заявки',
    en: 'Please fill in a few details to submit your request',
  },
  'Пожалуйста, заполните информацию для создания заявки:': {
    uk: 'Будь ласка, заповніть інформацію для створення заявки:',
    en: 'Please fill in the information to create your request:',
  },
  'Для быстрой обработки укажите, пожалуйста, следующую информацию:': {
    uk: 'Для швидкої обробки вкажіть, будь ласка, таку інформацію:',
    en: 'To process your request faster, please provide the following:',
  },
  'Добрый день, если у вас есть общие финансовые вопросы можете задать их тут\n\nДля создания заявки нужно заполнить данные':
    {
      uk: 'Доброго дня! Якщо у вас є загальні фінансові питання, можете поставити їх тут.\n\nДля створення заявки потрібно заповнити дані',
      en: 'Hello! You can ask any general billing question here.\n\nTo create a request, please fill in a few details',
    },
  'Введите ваше Имя и Фамилию полностью': {
    uk: 'Введіть ваші ім’я та прізвище повністю',
    en: 'Enter your full first and last name',
  },
  'Укажите ваш email который предоставили для регистрации в школе. Его можно уточнить у куратора':
    {
      uk: 'Вкажіть email, який ви надали для реєстрації в школі. Його можна уточнити у куратора',
      en: 'Enter the email you provided when registering with the school. Your curator can confirm it',
    },
  'Укажите вашу должность': {
    uk: 'Вкажіть вашу посаду',
    en: 'Enter your job title',
  },
  'Укажите вашего руководителя': {
    uk: 'Вкажіть вашого керівника',
    en: 'Enter your manager’s name',
  },
  'Укажите проект': { uk: 'Вкажіть проєкт', en: 'Select the project' },
  'Укажите ID клиента': {
    uk: 'Вкажіть ID клієнта',
    en: 'Enter the client ID',
  },
  'Укажите ФИО клиента, по которому возникла проблема': {
    uk: 'Вкажіть ПІБ клієнта, щодо якого виникла проблема',
    en: 'Enter the full name of the client the issue concerns',
  },
  'Выберите дату начала периода': {
    uk: 'Оберіть дату початку періоду',
    en: 'Select the start date of the period',
  },
  'Выберите дату конца периода': {
    uk: 'Оберіть дату кінця періоду',
    en: 'Select the end date of the period',
  },
  'Опишите ваш вопрос по ведению ФОП': {
    uk: 'Опишіть ваше питання щодо ведення ФОП',
    en: 'Describe your sole proprietorship question',
  },
  'Опишите вашу проблему': {
    uk: 'Опишіть вашу проблему',
    en: 'Describe your problem',
  },
  'Опишите вашу проблему или запрос': {
    uk: 'Опишіть вашу проблему або запит',
    en: 'Describe your problem or request',
  },
  'Укажите, какая возникла проблема с ПК (по возможности приложите скриншот или видео отдельным сообщением, номер AnyDesk — если уже устанавливали)':
    {
      uk: 'Вкажіть, яка проблема виникла з комп’ютером (за можливості додайте скриншот або відео окремим повідомленням, номер AnyDesk — якщо вже встановлювали)',
      en: 'Describe the problem with your computer (if possible attach a screenshot or video in a separate message, and your AnyDesk number if it is already installed)',
    },
  'Опишите проблему и этап, на котором она возникла (например: «при нажатии...» или «во время... и т.д.»)':
    {
      uk: 'Опишіть проблему та етап, на якому вона виникла (наприклад: «при натисканні…» або «під час…»)',
      en: 'Describe the problem and the step where it happened (for example: “when clicking…” or “while…”)',
    },
  'Ваша заявка создана, ожидайте решения': {
    uk: 'Вашу заявку створено, очікуйте на рішення',
    en: 'Your request has been created, we will get back to you shortly',
  },
};

// --- работа с базой: тот же формат хранения, что и у flowStore.js ---

function pool() {
  const connectionString = process.env.AGENT_BOT_DATABASE_URL;
  if (!connectionString) {
    throw new Error('AGENT_BOT_DATABASE_URL не задан (см. .env)');
  }
  return new pg.Pool({ connectionString });
}

async function loadCurrent() {
  // Файл через --file удобен для прогона на копии дерева, без доступа к базе.
  const fileArg = process.argv.find(a => a.startsWith('--file='));
  if (fileArg) return JSON.parse(readFileSync(fileArg.slice(7), 'utf8'));

  const db = pool();
  const { rows } = await db.query(
    'SELECT content FROM agent_bot_flow_versions ORDER BY id DESC LIMIT 1'
  );
  await db.end();
  if (!rows.length) throw new Error('agent_bot_flow_versions пуста');
  return rows[0].content;
}

async function saveVersion(content) {
  const db = pool();
  await db.query(
    'INSERT INTO agent_bot_flow_versions (content, created_by) VALUES ($1, $2)',
    [content, 'черновой перевод uk/en']
  );
  await db.end();
}

const flows = await loadCurrent();
const entries = collectEntries(flows);

let applied = 0;
const missing = new Set();

entries.forEach(entry => {
  const original = readBase(entry.get());
  const translation = TRANSLATIONS[original];
  if (!translation) {
    // Строки, которые переводить не нужно (названия проектов «Говорика»,
    // «Мова-Промова» — одинаковы во всех трёх языках), сюда тоже попадут:
    // список печатается, чтобы решение «не переводим» было осознанным, а не
    // случайно пропущенной строкой.
    missing.add(original);
    return;
  }
  let value = entry.get();
  Object.entries(translation).forEach(([locale, text]) => {
    value = writeLocale(value, locale, text);
  });
  entry.set(value);
  applied += 1;
});

console.log(`Переведено строк: ${applied} из ${entries.length}`);
if (missing.size) {
  console.log('\nБез перевода остались:');
  missing.forEach(text => console.log(`  ${JSON.stringify(text)}`));
}

// --out=path вместо записи в базу: даёт прогнать результат через валидатор и
// движок, не трогая живой сценарий.
const outArg = process.argv.find(a => a.startsWith('--out='));
if (outArg) {
  writeFileSync(outArg.slice(6), JSON.stringify(flows, null, 2));
  console.log(`\nРезультат записан в ${outArg.slice(6)}, база не тронута`);
  process.exit(0);
}

if (process.argv.includes('--dry')) {
  console.log('\n--dry: в базу ничего не записано');
  process.exit(0);
}

await saveVersion(flows);
console.log('\nСохранено новой версией сценария (откат — /admin → История)');
process.exit(0);
