// Одноразовый скрипт для онбординга нового агента: создаёт 5 персональных
// "папок" (Custom Views) — по одной на категорию (bumes, finance, logo-chat,
// slideedu, tech-support) — каждая с фильтром
// Категории=<X> + Приоритет=Срочность + Статус=Все.
//
// Зачем отдельный скрипт, а не часть engine.js/submit:
// Custom Views в Chatwoot персональные (belongs_to :user, см.
// app/models/custom_filter.rb) и создаются строго от имени токена, которым
// сделан запрос (Current.user, см.
// app/controllers/api/v1/accounts/custom_filters_controller.rb#create).
// Токен бота (CHATWOOT_BOT_TOKEN) тут не подходит — папки создались бы для
// самого бота, агенты их не увидят. Нужен личный access token того агента,
// для кого создаются папки (Profile Settings → Access Token — не пароль).
//
// Запуск (после того как у нового агента уже есть аккаунт в Chatwoot):
//   node scripts/provision-category-folders.js <personal_access_token>
//
// Скрипт идемпотентен — уже существующие у этого агента папки с такими же
// именами пропускаются, повторный запуск ничего не задублирует.
require('dotenv').config();
const axios = require('axios');

const BASE_URL = process.env.CHATWOOT_BASE_URL;
const ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID;

// Порядок и написание категорий — как в CATEGORY_ENTRY_NODE (engine.js) и
// в лейблах Chatwoot (Settings → Labels).
const CATEGORIES = ['bumes', 'finance', 'logo-chat', 'slideedu', 'tech-support'];

function folderName(category) {
  return `${category} — новые`;
}

// Структура query — снята напрямую с папки "finance — новые", созданной
// вручную через UI (Диалоги → фильтр → сохранить), чтобы гарантированно
// совпадать с тем, что генерирует сам Chatwoot (см. GET .../custom_filters).
function buildQuery(category) {
  return {
    payload: [
      {
        values: ['open', 'all'],
        attribute_key: 'status',
        query_operator: 'and',
        attribute_model: 'standard',
        filter_operator: 'equal_to',
        custom_attribute_type: '',
      },
      {
        values: [category],
        attribute_key: 'labels',
        query_operator: 'and',
        attribute_model: 'standard',
        filter_operator: 'equal_to',
        custom_attribute_type: '',
      },
      {
        values: ['urgent'],
        attribute_key: 'priority',
        filter_operator: 'equal_to',
      },
    ],
  };
}

async function main() {
  const token = process.argv[2];
  if (!token) {
    console.error(
      'Использование: node scripts/provision-category-folders.js <personal_access_token>\n' +
        '(личный Access Token агента — Profile Settings → Access Token, не пароль)'
    );
    process.exit(1);
  }
  if (!BASE_URL || !ACCOUNT_ID) {
    console.error('CHATWOOT_BASE_URL / CHATWOOT_ACCOUNT_ID не заданы в .env');
    process.exit(1);
  }

  const http = axios.create({
    baseURL: `${BASE_URL}/api/v1/accounts/${ACCOUNT_ID}`,
    headers: { api_access_token: token, 'Content-Type': 'application/json' },
    timeout: 10000,
  });

  let existing;
  try {
    const { data } = await http.get('/custom_filters', { params: { filter_type: 'conversation' } });
    existing = new Set(data.map(f => f.name));
  } catch (err) {
    console.error(
      'Не удалось получить список папок — проверьте токен (личный Access Token, не пароль и не токен бота).'
    );
    console.error(err.response?.data || err.message);
    process.exit(1);
  }

  for (const category of CATEGORIES) {
    const name = folderName(category);
    if (existing.has(name)) {
      console.log(`Пропущено (уже есть): ${name}`);
      continue;
    }
    try {
      await http.post('/custom_filters', {
        custom_filter: { name, filter_type: 'conversation', query: buildQuery(category) },
      });
      console.log(`Создано: ${name}`);
    } catch (err) {
      console.error(`Ошибка при создании "${name}":`, err.response?.data || err.message);
    }
  }
}

main();
