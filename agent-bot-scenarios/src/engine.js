// flows читается через getFlows() внутри каждой функции (а не одной константой
// на уровне модуля) — так правки, сохранённые из /admin (см. flowStore.js),
// подхватываются следующим же сообщением, без перезапуска pm2-процесса.
const { getFlows } = require('./flowStore');
const store = require('./store');

const BACK_ID = '__back__';
const MENU_ID = '__menu__';

// Категории pre-chat формы, для которых main_menu — правильная точка входа
// (всё дерево сценария сейчас целиком про финансы). Остальные категории
// (Техническая поддержка, Календарь логопеда, Logo-chat, Slideedu)
// обслуживаются правилами автоматизации Chatwoot (Settings → Автоматизация:
// метка + канонический ответ, см. пример с AnyDesk-инструкцией для
// tech-support) — бот в них не должен подсовывать финансовое меню (см. отчёт
// по замечаниям от 2026-08-17, пункты 2-3: клиент выбирал разные категории,
// а видел одни и те же кнопки). Если категория не задана (диалог без
// pre-chat формы, либо старые диалоги до её появления) — сохраняем прежнее
// поведение и открываем main_menu как раньше.
const BOT_CATEGORIES = new Set(['Финансовые вопросы']);

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
      // Freshchat рендерит такие поля (валюта и т.п.) как quick-reply меню,
      // не как свободный ввод текста.
      await client.sendMenu(
        conversationId,
        node.prompt,
        node.field.options.map(o => ({ id: o, title: o, value: o }))
      );
    } else if (node.field.type === 'email') {
      // content_type: input_email — нативная валидация Chatwoot на виджете,
      // плюс движок ещё раз проверяет формат при получении ответа.
      await client.sendEmailQuestion(conversationId, node.prompt);
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
    await client.sendText(conversationId, node.message);
    if (node.group) {
      try {
        await client.assignTeamByName(conversationId, node.group);
      } catch (err) {
        console.error('[engine] assignTeamByName failed:', err.message);
      }
    } else if (node.label) {
      try {
        await client.addLabel(conversationId, node.label);
      } catch (err) {
        console.error('[engine] addLabel failed:', err.message);
      }
    }
    // Резолвим диалог — это то, что превращает "одну бесконечную переписку"
    // в отдельные заявки с номерами: следующее сообщение того же контакта
    // (при выключенной опции "Allow messages after resolved" на инбоксе)
    // создаст НОВЫЙ conversation/display_id вместо дописывания в этот же.
    // См. README → "Тикеты и несколько заявок от одного клиента".
    try {
      await client.resolveConversation(conversationId);
    } catch (err) {
      console.error('[engine] resolveConversation failed:', err.message);
    }
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
  // Категория выбрана и это не "наша" (финансовая) — молчим, оставляем
  // ответ автоматизации Chatwoot единственным сообщением в диалоге.
  if (category && !BOT_CATEGORIES.has(category)) return;

  const state = freshState();
  await renderNode(client, conversationId, 'main_menu', state);
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
  if (!node || node.type !== 'question' || node.field.type === 'select') {
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

module.exports = { startFlow, handleOptionSelected, handleTextAnswer };
