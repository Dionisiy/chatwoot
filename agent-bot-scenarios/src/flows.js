// Дерево сценария — полная версия, повторяющая структуру бота "Finance AI"
// в Freshchat (10 веток с главного меню, см. README → "Соответствие Freshchat").
//
// Типы узлов:
//   menu     — меню кнопок. options: [{ id, title, next }]
//              "Назад"/"Главное меню" добавляются движком автоматически.
//   question — один вопрос. field: { name, type }, type ∈ 'text'|'email'.
//              email проверяется движком (простой regex) и переспрашивается
//              при ошибке — как встроенная валидация поля в Freshchat.
//   message  — статический текст, сразу же (в этом же ходу) переходит на next.
//   link     — как message, но с ссылкой на внешний ресурс (например,
//              календарь для записи) и БЕЗ создания заявки — просто
//              информационный узел с навигацией "Назад"/"Главное меню".
//   end      — терминальный узел без тикета (например, "обратитесь к
//              куратору напрямую") — просто сообщение, диалог не назначается
//              ни на какую группу.
//   submit   — финальный узел с созданием тикета: отправляет текст,
//              назначает group (team в Chatwoot) по имени, резолвит диалог
//              (см. README → "Тикеты и несколько заявок от одного клиента"),
//              сбрасывает состояние.
//
// id корневого узла — 'main_menu'.

// ---- Общий шаблон "форма заявки" (email → должность → руководитель → ФИО →
// доп.поля → submit), которым в Freshchat построены почти все ветки ----
function requestForm({ prefix, intro, extraFields = [], submitMessage, group }) {
  const ids = {
    intro: `${prefix}_intro`,
    email: `${prefix}_email`,
    position: `${prefix}_position`,
    manager: `${prefix}_manager`,
    name: `${prefix}_name`,
    submit: `${prefix}_submit`,
  };

  const nodes = {
    [ids.intro]: {
      type: 'message',
      text: intro,
      next: ids.email,
    },
    [ids.email]: {
      type: 'question',
      prompt:
        'Укажите ваш email который предоставили для регистрации в школе. Его можно уточнить у куратора',
      field: { name: 'email', type: 'email' },
      next: ids.position,
    },
    [ids.position]: {
      type: 'question',
      prompt: 'Укажите вашу должность',
      field: { name: 'position', type: 'text' },
      next: ids.manager,
    },
    [ids.manager]: {
      type: 'question',
      prompt: 'Укажите вашего руководителя',
      field: { name: 'manager', type: 'text' },
      next: ids.name,
    },
    [ids.name]: {
      type: 'question',
      prompt: 'Введите ваше Имя и Фамилию полностью',
      field: { name: 'full_name', type: 'text' },
      next: extraFields.length ? extraFields[0].id : ids.submit,
    },
  };

  // Доп. поля, специфичные для ветки (например, период/валюта/сумма) —
  // выстраиваются в цепочку между анкетой и submit.
  extraFields.forEach((f, i) => {
    const nextId = extraFields[i + 1] ? extraFields[i + 1].id : ids.submit;
    nodes[f.id] = {
      type: 'question',
      prompt: f.prompt,
      field: { name: f.field, type: f.type || 'text' },
      next: nextId,
    };
  });

  nodes[ids.submit] = {
    type: 'submit',
    message: submitMessage || 'Ваша заявка создана, ожидайте решения',
    group,
  };

  return { entryId: ids.intro, nodes };
}

// Ветка 3 — "Неправильная сумма" (Freshchat: 3.2–3.13, полностью сверено с билдером).
const wrongAmount = requestForm({
  prefix: 'wrong_amount',
  intro: 'Нужно заполнить данные для подачи заявки',
  extraFields: [
    { id: 'wrong_amount_period_start', prompt: 'Выберите дату начала периода', field: 'period_start' },
    { id: 'wrong_amount_period_end', prompt: 'Выберите дату конца периода', field: 'period_end' },
    {
      id: 'wrong_amount_currency',
      prompt: 'Выберите валюту в которой была начислена сумма',
      field: 'currency',
      // Freshchat рендерит это как quick-reply меню (Злотые/Доллар/Гривна),
      // не свободный текст — движок отправит через sendMenu.
      type: 'select',
      options: ['Злотые', 'Доллар', 'Гривна'],
    },
    { id: 'wrong_amount_actual', prompt: 'Напишите фактическую сумму начисления', field: 'actual_amount' },
    { id: 'wrong_amount_expected', prompt: 'Напишите сколько должны были получить по отчёту?', field: 'expected_amount' },
  ],
  submitMessage: 'Ваша заявка создана, ожидайте решения',
  group: 'Финансы - Поступила неправильная сумма ЗП',
});

// Ветка 4 — "Не учтен бонус" (Freshchat: 4.2–4.13, поля сверены по названиям
// узлов в сайдбаре — сумма начисления + проект, без диапазона дат).
const missingBonus = requestForm({
  prefix: 'missing_bonus',
  intro: 'Нужно заполнить данные для подачи заявки',
  extraFields: [
    { id: 'missing_bonus_period_start', prompt: 'Выберите дату начала периода', field: 'period_start' },
    { id: 'missing_bonus_period_end', prompt: 'Выберите дату конца периода', field: 'period_end' },
    { id: 'missing_bonus_amount', prompt: 'Напишите сумму начисления', field: 'amount' },
    { id: 'missing_bonus_project', prompt: 'По какому проекту?', field: 'project' },
  ],
  submitMessage: 'Ваша заявка создана, ожидайте решения',
  group: 'Финансы - Не учтен бонус',
});

// Ветка 9 — "Общие вопросы" (Freshchat: 9.1–9.8, полностью сверено с билдером —
// совпадает с тем, что уже было в первой версии бота).
const generalQuestions = requestForm({
  prefix: 'general',
  intro:
    'Добрый день, если у вас есть общие финансовые вопросы можете задать их тут\n\n' +
    'Для создания заявки нужно заполнить данные',
  extraFields: [
    { id: 'general_problem', prompt: 'Опишите вашу проблему', field: 'problem' },
  ],
  submitMessage: 'Ваша заявка создана, ожидайте решения',
  group: 'Финансы - Общие вопросы',
});

// ---- Ветки 5–8, 10 — реконструированы по общему шаблону + названию ветки.
// В билдере видел только название и число узлов (не открыл внутренний
// список полей из-за глюка UI при просмотре — тот самый баг с необходимостью
// ручного рефреша, о котором вы говорили). Логика/группа/шаблон верны, но
// точные формулировки доп.полей стоит сверить с Freshchat и поправить. ----

const incomeCertificate = requestForm({
  prefix: 'income_cert',
  intro: 'Нужно заполнить данные для подачи заявки',
  extraFields: [
    { id: 'income_cert_period', prompt: 'За какой период нужна справка?', field: 'period' },
    { id: 'income_cert_purpose', prompt: 'Куда предоставляется справка?', field: 'purpose' },
  ],
  submitMessage: 'Ваша заявка создана, ожидайте решения',
  group: 'Финансы - Справка о доходах',
});

const invoice = requestForm({
  prefix: 'invoice',
  intro: 'Нужно заполнить данные для подачи заявки',
  extraFields: [
    { id: 'invoice_details', prompt: 'Укажите реквизиты для инвойса', field: 'invoice_details' },
    { id: 'invoice_amount', prompt: 'Укажите сумму инвойса', field: 'amount' },
  ],
  submitMessage: 'Ваша заявка создана, ожидайте решения',
  group: 'Финансы - Оформление инвойса',
});

const salaryStatement = requestForm({
  prefix: 'salary_stmt',
  intro: 'Нужно заполнить данные для подачи заявки',
  extraFields: [
    { id: 'salary_stmt_period_start', prompt: 'Выберите дату начала периода', field: 'period_start' },
    { id: 'salary_stmt_period_end', prompt: 'Выберите дату конца периода', field: 'period_end' },
  ],
  submitMessage: 'Ваша заявка создана, ожидайте решения',
  group: 'Финансы - Выписка ЗП за период',
});

const requisitesChange = requestForm({
  prefix: 'requisites',
  intro: 'Нужно заполнить данные для подачи заявки',
  extraFields: [
    { id: 'requisites_old', prompt: 'Укажите текущие реквизиты', field: 'old_requisites' },
    { id: 'requisites_new', prompt: 'Укажите новые реквизиты', field: 'new_requisites' },
  ],
  submitMessage: 'Ваша заявка создана, ожидайте решения',
  group: 'Финансы - Смена реквизитов',
});

const fopQuestions = requestForm({
  prefix: 'fop',
  intro: 'Нужно заполнить данные для подачи заявки',
  extraFields: [
    { id: 'fop_problem', prompt: 'Опишите ваш вопрос по ведению ФОП', field: 'problem' },
  ],
  submitMessage: 'Ваша заявка создана, ожидайте решения',
  group: 'Финансы - Вопросы по ведению ФОП',
});

module.exports = {
  main_menu: {
    type: 'menu',
    title: 'Добрый день, выберите вариант',
    options: [
      { id: 'consult', title: 'Запись на консультацию', next: 'consult_start' },
      { id: 'payment_problem', title: 'Проблема с платежами', next: 'payment_problem_menu' },
      { id: 'fop', title: 'Вопросы по ведению ФОП', next: fopQuestions.entryId },
      { id: 'finance_docs', title: 'Получение финансовых документов', next: 'finance_docs_menu' },
      { id: 'general', title: 'Общие финансовые вопросы', next: generalQuestions.entryId },
    ],
  },

  // ---- Подменю "Проблема с платежами" (Freshchat 1.2) ----
  payment_problem_menu: {
    type: 'menu',
    title: 'Проблема с платежами',
    options: [
      { id: 'wrong_amount', title: 'Поступила неправильная сумма ЗП', next: wrongAmount.entryId },
      { id: 'missing_bonus', title: 'Не учтен бонус', next: missingBonus.entryId },
    ],
  },

  // ---- Подменю "Получение финансовых документов" (Freshchat 1.3) ----
  finance_docs_menu: {
    type: 'menu',
    title: 'Получение финансовых документов',
    options: [
      { id: 'income_cert', title: 'Справка о доходах', next: incomeCertificate.entryId },
      { id: 'invoice', title: 'Оформление инвойса', next: invoice.entryId },
      { id: 'salary_stmt', title: 'Выписка ЗП за период', next: salaryStatement.entryId },
    ],
  },

  // ---- Ветка 2 — "Запись на консультацию": условное ветвление Да/Нет,
  // заканчивается ссылкой на календарь или сообщением "к куратору" —
  // БЕЗ создания заявки (Freshchat 2.1–2.4). ----
  consult_start: {
    type: 'menu',
    title: 'Запись на консультацию',
    options: [
      { id: 'open_fop', title: 'Открыть ФОП', next: 'consult_training_check' },
      { id: 'close_fop', title: 'Закрыть ФОП', next: 'consult_calendar' },
      { id: 'requisites_pick', title: 'Подбор реквизитов', next: 'consult_calendar' },
    ],
  },
  consult_training_check: {
    type: 'menu',
    title:
      'Прошли ли вы обучение на платформе THI: "Как открыть ФОП и как оплачивать налоги"?',
    options: [
      { id: 'yes', title: 'Да', next: 'consult_calendar' },
      { id: 'no', title: 'Нет', next: 'consult_curator' },
    ],
  },
  consult_calendar: {
    type: 'link',
    text: 'Перейдите в календарь и заполните форму',
    url: null, // подставить реальную ссылку на календарь записи
    linkTitle: 'Календарь',
  },
  consult_curator: {
    type: 'end',
    text: 'Обратитесь к вашему куратору, чтобы пройти обучение перед записью на консультацию.',
  },

  // Ветки-формы (email → должность → руководитель → ФИО → доп.поля → submit)
  ...wrongAmount.nodes,
  ...missingBonus.nodes,
  ...generalQuestions.nodes,
  ...incomeCertificate.nodes,
  ...invoice.nodes,
  ...salaryStatement.nodes,
  ...requisitesChange.nodes,
  ...fopQuestions.nodes,

  // "Смена реквизитов" в самом Freshchat сейчас ОТКЛЮЧЕНА от главного меню
  // (видно в "Комплексный огляд" — карточка не соединена с деревом). Узлы
  // держим готовыми на случай, если вариант снова понадобится в меню —
  // просто добавить пункт в main_menu.options.
};
