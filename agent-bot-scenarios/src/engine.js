// flows читается через getFlows() внутри каждой функции (а не одной константой
// на уровне модуля) — так правки, сохранённые из /admin (см. flowStore.js),
// подхватываются следующим же сообщением, без перезапуска pm2-процесса.
const { getFlows } = require('./flowStore');
const store = require('./store');

const BACK_ID = '__back__';
const MENU_ID = '__menu__';
const SKIP_ID = '__skip__';

// Категории pre-chat формы → узел, с которого бот начинает диалог для этой
// категории (см. отчёт по замечаниям от 2026-08-17, пункты 2-3: раньше бот
// на любое первое сообщение всегда открывал финансовое main_menu, независимо
// от выбранной категории). У каждой нефинансовой категории уже есть и своё
// правило автоматизации Chatwoot (метка + канонический текст — например,
// AnyDesk-инструкция для tech-support), и теперь ещё и своя короткая
// пошаговая форма бота (ФИО/проект/описание и т.п., см. flows.json) — оба
// ответа приходят клиенту, автоматизацию решили не отключать. Если категория
// не задана (диалог без pre-chat формы, либо старые диалоги до её появления)
// — сохраняем прежнее поведение и открываем main_menu.
const CATEGORY_ENTRY_NODE = {
  'Финансовые вопросы': 'main_menu',
  'Календарь логопеда': 'calendar_intro',
  'Техническая поддержка': 'tech_intro',
  'Logo-chat': 'logo_intro',
  Slideedu: 'slideedu_intro',
};

// Простая проверка email — так же, как в Freshchat поле "Адреса ел. пошти"
// не пропускает ввод без @ и точки в домене (см. README).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function withNav(options, { showBack }) {
  const nav = [];
  if (showBack) nav.push({ id: BACK_ID, title: '« Назад', value: BACK_ID });
  nav.push({ id: MENU_ID, title: '🏠 Главное меню', value: MENU_ID });
  return [
    ...options.map(o => ({ id: o.id, title: o.title, value: o.id })),
    ...nav,
  ];
}

function withOptionalSkip(options, node) {
  return node.optional
    ? [...options, { id: SKIP_ID, title: 'Пропустить', value: SKIP_ID }]
    : options;
}

function freshState() {
  return { nodeId: 'main_menu', formData: {}, history: [] };
}

async function renderNode(client, conversationId, nodeId, state) {
  const flows = getFlows();
  const node = flows[nodeId] || flows.main_menu;
  const resolvedId = flows[nodeId] ? nodeId : 'main_menu';

  if (node.type === 'menu') {
    await client.sendMenu(
      conversationId,
      node.title,
      withNav(node.options, { showBack: state.history.length > 0 })
    );
    state.nodeId = resolvedId;
    store.set(conversationId, state);
    return;
  }

  if (node.type === 'question') {
    if (node.field.type === 'select') {
      // Если имя поля совпадает с ключом custom-атрибута контакта (например
      // "project" — его пишет Laravel-бэкенд SlideEdu через widget SDK при
      // логине уже существующего пользователя, см. startFlow) и его значение
      // входит в options — не спрашиваем то, что уже знаем из SlideEdu,
      // сразу идём дальше. Цель интеграции ровно в этом: меньше ручного
      // выбора — меньше ошибок (например, неверно выбранный проект).
      const knownValue = state.contactAttributes?.[node.field.name];
      if (knownValue && node.field.options.includes(knownValue)) {
        state.formData[node.field.name] = knownValue;
        state.history.push(resolvedId);
        await renderNode(client, conversationId, node.next, state);
        return;
      }
      // Freshchat рендерит такие поля (валюта и т.п.) как quick-reply меню,
      // не как свободный ввод текста.
      await client.sendMenu(
        conversationId,
        node.prompt,
        node.field.options.map(o => ({ id: o, title: o, value: o }))
      );
    } else if (node.field.type === 'student_select') {
      // Список активных учеников конкретного учителя (Client из SlideEdu,
      // см. ChatIntegrationController::identity()) — приходит в
      // state.contactAttributes.students, если контакт залогинен через
      // виджет SDK (setUser с custom_attributes). Кнопки вместо ручного
      // ввода ФИО/ID: нельзя опечататься, и оба поля (текущее имя-поле +
      // client_id) заполняются разом, минуя следующий вопрос "Укажите ID
      // клиента" — см. applyStudentSelection.
      const students = state.contactAttributes?.students;
      if (Array.isArray(students) && students.length) {
        await client.sendMenu(
          conversationId,
          node.prompt,
          withOptionalSkip(
            students.map(s => ({ id: String(s.id), title: s.name, value: s.name })),
            node
          )
        );
      } else if (node.optional) {
        // Список недоступен (контакт не идентифицирован через SlideEdu) —
        // прежнее поведение: обычный текстовый вопрос с кнопкой "Пропустить".
        await client.sendMenu(conversationId, node.prompt, [
          { id: SKIP_ID, title: 'Пропустить', value: SKIP_ID },
        ]);
      } else {
        await client.sendText(conversationId, node.prompt);
      }
    } else if (node.optional) {
      // Необязательный текстовый вопрос (например, "Имя клиента", "ID
      // клиента" — учитель мог их не знать в моменте) — кнопка "Пропустить"
      // рядом с полем. Свободный текст при этом всё ещё работает как обычно
      // (handleTextAnswer не завязан на content_type исходящего сообщения) —
      // клиент может либо ответить, либо нажать кнопку. Нативную
      // email-валидацию (input_email) с кнопками Chatwoot совмещать не даёт,
      // поэтому optional-поля с field.type: email этим путём не поддержаны —
      // пока не требовалось.
      await client.sendMenu(conversationId, node.prompt, [
        { id: SKIP_ID, title: 'Пропустить', value: SKIP_ID },
      ]);
    } else if (node.field.type === 'email') {
      // content_type: input_email — нативная валидация Chatwoot на виджете,
      // плюс движок ещё раз проверяет формат при получении ответа.
      await client.sendEmailQuestion(conversationId, node.prompt);
    } else if (node.field.type === 'date') {
      // Нативный date-picker (content_type: 'form') — ответ приходит через
      // message_updated и обрабатывается handleFormSubmitted, не
      // handleTextAnswer (см. chatwootClient.js#sendDateQuestion).
      await client.sendDateQuestion(conversationId, node.prompt, node.field.name);
    } else {
      await client.sendText(conversationId, node.prompt);
    }
    state.nodeId = resolvedId;
    store.set(conversationId, state);
    return;
  }

  if (node.type === 'message') {
    await client.sendText(conversationId, node.text);
    state.history.push(resolvedId);
    await renderNode(client, conversationId, node.next, state);
    return;
  }

  if (node.type === 'link') {
    // Информационный терминальный узел (например, ссылка на календарь) —
    // без создания заявки, только текст + опциональная ссылка + навигация.
    const text = node.url ? `${node.text}\n${node.linkTitle}: ${node.url}` : node.text;
    await client.sendMenu(conversationId, text, [
      { id: MENU_ID, title: '🏠 Главное меню', value: MENU_ID },
      { id: BACK_ID, title: '« Назад', value: BACK_ID },
    ]);
    state.nodeId = resolvedId;
    store.set(conversationId, state);
    return;
  }

  if (node.type === 'end') {
    // Терминальный узел без тикета — например, "обратитесь к куратору".
    await client.sendText(conversationId, node.text);
    store.clear(conversationId);
    return;
  }

  if (node.type === 'submit') {
    // conversationId — это display_id (тот самый номер, что виден в адресной
    // строке /conversations/18 и в самом Chatwoot) — см. пункт 5 отчёта по
    // замечаниям от 2026-08-17. Дописываем его автоматически ко всем
    // submit-узлам одним местом в коде, а не руками в каждой ветке /admin —
    // независимо от будущих правок текста в редакторе номер заявки не
    // потеряется.
    await client.sendText(conversationId, `${node.message}\nНомер заявки: ${conversationId}`);
    // group (команда) и label (метка/подкатегория) независимы друг от друга —
    // например, у веток финансов одновременно есть и распределение по
    // команде, и метка подкатегории для фильтрации в списке меток.
    if (node.group) {
      try {
        await client.assignTeamByName(conversationId, node.group);
      } catch (err) {
        console.error('[engine] assignTeamByName failed:', err.message);
      }
    }
    if (node.label) {
      try {
        await client.addLabel(conversationId, node.label);
      } catch (err) {
        console.error('[engine] addLabel failed:', err.message);
      }
    }
    // Диалог намеренно НЕ резолвится: заявка остаётся открытой, пока агент
    // реально её не обработает — иначе резолв в момент сабмита ломает
    // отчётность Chatwoot (время решения считается от резолва, а не от
    // реальной обработки) и прячет тикет из дефолтного фильтра "Открыт".
    //
    // При этом Chatwoot сам создаёт любой новый диалог в статусе Pending,
    // если у инбокса есть активный бот (это не наш код, см. комментарий в
    // chatwootClient.js#setStatus) — на submit явно переводим его в Open
    // штатным bot-handoff, а не резолвом.
    try {
      await client.setStatus(conversationId, 'open');
    } catch (err) {
      console.error('[engine] setStatus(open) failed:', err.message);
    }
    // Номер заявки при этом не теряется: если клиент хочет открыть ещё одну
    // заявку, не дожидаясь обработки текущей, у него в виджете есть кнопка
    // "Новая заявка" (см. правку ChatFooter.vue) — она ведёт на pre-chat
    // форму и создаёт полностью отдельный новый conversation/display_id,
    // независимо от статуса текущего. См. README → "Несколько заявок от
    // одного клиента".
    store.clear(conversationId);
  }
}

async function startFlow(client, conversationId) {
  let category = null;
  try {
    category = await client.getConversationCategory(conversationId);
  } catch (err) {
    console.error('[engine] getConversationCategory failed:', err.message);
  }

  // Custom-атрибуты контакта (project/languages из SlideEdu, см.
  // chatwootClient.js#getContactCustomAttributes) — забираем один раз в
  // начале диалога и кладём в state, чтобы renderNode мог автоматически
  // пропускать select-вопросы с уже известным ответом (например
  // calendar_project), не дёргая API заново на каждом шаге.
  let contactAttributes = {};
  try {
    contactAttributes = await client.getContactCustomAttributes(conversationId);
  } catch (err) {
    console.error('[engine] getContactCustomAttributes failed:', err.message);
  }

  // Категория не задана — старое поведение по умолчанию (main_menu).
  // Категория задана, но для неё нет ветки в CATEGORY_ENTRY_NODE — молчим,
  // ответ автоматизации Chatwoot остаётся единственным в диалоге.
  const entryNode = category ? CATEGORY_ENTRY_NODE[category] : 'main_menu';
  if (!entryNode) return;

  const state = freshState();
  state.contactAttributes = contactAttributes;
  await renderNode(client, conversationId, entryNode, state);
}

// Выбор ученика из списка (клик по кнопке или точное совпадение текста, см.
// handleOptionSelected/handleTextAnswer) — заполняет не только текущее поле
// (ФИО), но и client_id, если следующий узел — это как раз вопрос "Укажите
// ID клиента" (см. flows.json: во всех 4 категориях client_name и client_id
// идут двумя соседними optional-вопросами подряд). Так учитель, выбравший
// ученика из списка, не отвечает на тот же вопрос про клиента дважды.
async function applyStudentSelection(
  client,
  conversationId,
  flows,
  state,
  currentNode,
  student
) {
  state.formData[currentNode.field.name] = student.name;
  state.history.push(state.nodeId);
  const idNode = flows[currentNode.next];
  if (idNode?.type === 'question' && idNode.field?.name === 'client_id') {
    state.formData[idNode.field.name] = String(student.id);
    state.history.push(currentNode.next);
    return renderNode(client, conversationId, idNode.next, state);
  }
  return renderNode(client, conversationId, currentNode.next, state);
}

// Пользователь нажал кнопку (menu-опцию, "Назад" или "Главное меню")
async function handleOptionSelected(client, conversationId, selectedId) {
  const flows = getFlows();
  const state = store.get(conversationId) || freshState();

  if (selectedId === MENU_ID) {
    state.history = [];
    return renderNode(client, conversationId, 'main_menu', state);
  }
  if (selectedId === BACK_ID) {
    const prev = state.history.pop() || 'main_menu';
    return renderNode(client, conversationId, prev, state);
  }

  const currentNode = flows[state.nodeId];

  // Клик "Пропустить" на необязательном вопросе (см. renderNode) —
  // сохраняем пустое значение и идём дальше, как будто ответили.
  if (selectedId === SKIP_ID && currentNode?.type === 'question' && currentNode.optional) {
    state.formData[currentNode.field.name] = null;
    state.history.push(state.nodeId);
    return renderNode(client, conversationId, currentNode.next, state);
  }

  // Выбор ученика из динамического списка (см. renderNode/applyStudentSelection).
  if (currentNode?.type === 'question' && currentNode.field.type === 'student_select') {
    const students = state.contactAttributes?.students || [];
    const student = students.find(s => String(s.id) === selectedId);
    if (!student) {
      return renderNode(client, conversationId, state.nodeId, state);
    }
    return applyStudentSelection(client, conversationId, flows, state, currentNode, student);
  }

  // Ответ на question с полем-выбором (например, валюта) — не переход по
  // меню, а сохранение значения формы, как и обычный текстовый ответ.
  if (currentNode?.type === 'question' && currentNode.field.type === 'select') {
    if (!currentNode.field.options.includes(selectedId)) {
      return renderNode(client, conversationId, state.nodeId, state);
    }
    state.formData[currentNode.field.name] = selectedId;
    state.history.push(state.nodeId);
    return renderNode(client, conversationId, currentNode.next, state);
  }

  const option = currentNode?.options?.find(o => o.id === selectedId);
  if (!option) {
    return renderNode(client, conversationId, 'main_menu', state);
  }

  state.history.push(state.nodeId);
  return renderNode(client, conversationId, option.next, state);
}

// Пользователь напечатал свободный текст (ответ на question-шаг,
// либо самое первое сообщение в диалоге)
async function handleTextAnswer(client, conversationId, text) {
  const flows = getFlows();
  const state = store.get(conversationId);

  if (!state) {
    return startFlow(client, conversationId);
  }

  const trimmed = text.trim().toLowerCase();
  if (trimmed === 'меню' || trimmed === 'главное меню') {
    state.history = [];
    return renderNode(client, conversationId, 'main_menu', state);
  }
  if (trimmed === 'назад') {
    const prev = state.history.pop() || 'main_menu';
    return renderNode(client, conversationId, prev, state);
  }

  const node = flows[state.nodeId];

  // Ответ на select-вопрос напечатан текстом, а не кликом по кнопке
  // (handleOptionSelected) — типично, когда клиент не глядя вводит ответ в
  // поле ввода вместо кнопки. Раньше это всегда считалось невалидным и
  // вопрос переспрашивался бесконечно, даже если текст слово в слово
  // совпадал с одним из option. Сравниваем без учёта регистра/крайних
  // пробелов и, если совпало, засчитываем как обычный выбор.
  if (node?.type === 'question' && node.field.type === 'select') {
    const matched = node.field.options.find(
      o => o.trim().toLowerCase() === trimmed
    );
    if (matched) {
      state.formData[node.field.name] = matched;
      state.history.push(state.nodeId);
      return renderNode(client, conversationId, node.next, state);
    }
    // Не совпало ни с одним вариантом — переспрашиваем тем же вопросом,
    // кнопки уже были отправлены раньше и повторно не дублируются.
    return renderNode(client, conversationId, state.nodeId, state);
  }

  // Ответ на вопрос-выбор ученика напечатан текстом (см. renderNode) —
  // сравниваем с ФИО из списка без учёта регистра/пробелов. Если не
  // совпало ни с одним известным учеником (например, его ещё нет в
  // SlideEdu) — принимаем как обычный свободный ввод ФИО, а не
  // переспрашиваем: список — это подсказка, а не строгий валидатор.
  if (node?.type === 'question' && node.field.type === 'student_select') {
    const students = state.contactAttributes?.students || [];
    const matched = students.find(s => s.name.trim().toLowerCase() === trimmed);
    if (matched) {
      return applyStudentSelection(client, conversationId, flows, state, node, matched);
    }
    state.formData[node.field.name] = text.trim();
    state.history.push(state.nodeId);
    return renderNode(client, conversationId, node.next, state);
  }

  if (!node || node.type !== 'question') {
    // Мы сейчас не на текстовом шаге (например, ждём нажатия кнопки/выбора
    // из quick-reply меню) — просто повторно показываем текущий узел.
    return renderNode(client, conversationId, state.nodeId, state);
  }

  const trimmedValue = text.trim();
  if (node.field.type === 'email' && !EMAIL_RE.test(trimmedValue)) {
    // Как и в Freshchat — некорректный email не проходит дальше,
    // а переспрашивается тем же вопросом.
    await client.sendText(
      conversationId,
      'Похоже, это не похоже на email. Укажите адрес в формате [email protected]'
    );
    return renderNode(client, conversationId, state.nodeId, state);
  }

  state.formData[node.field.name] = trimmedValue;
  state.history.push(state.nodeId);
  return renderNode(client, conversationId, node.next, state);
}

// Ответ на вопрос с содержимым content_type: 'form' (сейчас — только
// date-picker, см. renderNode/sendDateQuestion). values — [{ name, value }],
// как их шлёт AgentMessageBubble.vue#onFormSubmit; value от нативного
// <input type="date"> — строка YYYY-MM-DD, доп. валидация формата не нужна.
async function handleFormSubmitted(client, conversationId, values) {
  const flows = getFlows();
  const state = store.get(conversationId);
  if (!state) return startFlow(client, conversationId);

  const node = flows[state.nodeId];
  if (!node || node.type !== 'question' || node.field.type !== 'date') {
    // Не тот шаг, который мы ожидали (например, устаревшее сообщение) —
    // просто повторно показываем текущий узел.
    return renderNode(client, conversationId, state.nodeId, state);
  }

  const value = values.find(v => v.name === node.field.name)?.value;
  if (!value) {
    return renderNode(client, conversationId, state.nodeId, state);
  }

  state.formData[node.field.name] = value;
  state.history.push(state.nodeId);
  return renderNode(client, conversationId, node.next, state);
}

module.exports = { startFlow, handleOptionSelected, handleTextAnswer, handleFormSubmitted };
