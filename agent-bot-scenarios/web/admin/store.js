// Общее состояние редактора сценария — простой composable (без Pinia, для
// одного самодостаточного SPA хватает reactive() + модульного синглтона).
// Логика (BFS-раскладка схемы, группировка по веткам для сайдбара) — прямой
// перенос из старой vanilla-версии (adminUi.js), только вместо ручного
// innerHTML теперь просто реактивный state, а перерисовку берёт на себя Vue.
import { reactive } from 'vue';

export const TYPES = ['menu', 'question', 'message', 'link', 'end', 'submit'];

const BOX_W = 230;
const BOX_H = 64;
const COL_W = 280;
const ROW_H = 130;
const PAD = 40;

export const state = reactive({
  flows: {},
  teamNames: [],
  selectedId: null,
  loading: true,
  loadError: null,
  saving: false,
  dirty: false,
  saveStatus: null, // { ok: true, text } | { ok: false, text }
  scrollTarget: null, // id узла, к которому нужно проскроллить canvas
  search: '', // общий фильтр сайдбара — правится тулбаром, читается сайдбаром
  historyOpen: false,
  historyLoading: false,
  historyError: null,
  historyVersions: [], // [{ id, created_at, created_by }], без content (см. HistoryPanel.vue)
  historyRestoringId: null,
});

function setDirty() {
  state.dirty = true;
}

export async function loadAll() {
  state.loading = true;
  state.loadError = null;
  try {
    // Относительные пути без ведущего слэша — принципиально, см. комментарий
    // у app.get('/admin', ...) в server.js: под nginx-прокси /agent-bot/
    // абсолютный путь вида "/admin/api/flows" уходит мимо прокси на корень
    // домена. Резолвится корректно только потому, что сервер отдаёт эту
    // страницу исключительно с "/" на конце (редиректит бы иначе).
    const [flowsRes, teamsRes] = await Promise.all([
      fetch('api/flows'),
      fetch('api/teams'),
    ]);
    if (!flowsRes.ok) throw new Error(`GET api/flows: ${flowsRes.status}`);
    state.flows = await flowsRes.json();
    state.teamNames = teamsRes.ok ? await teamsRes.json() : [];
  } catch (err) {
    state.loadError = err.message;
  } finally {
    state.loading = false;
  }
}

export async function save() {
  state.saving = true;
  state.saveStatus = null;
  try {
    const res = await fetch('api/flows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.flows),
    });
    const data = await res.json();
    if (!res.ok) {
      state.saveStatus = {
        ok: false,
        text: (data.errors || [data.error || 'неизвестная ошибка']).join('; '),
      };
      return false;
    }
    state.dirty = false;
    state.saveStatus = {
      ok: true,
      text: 'Сохранено ' + new Date().toLocaleTimeString(),
    };
    return true;
  } catch (err) {
    state.saveStatus = { ok: false, text: 'Ошибка сети: ' + err.message };
    return false;
  } finally {
    state.saving = false;
  }
}

// История версий (см. db/schema.sql, flowStore.js) — каждое сохранение
// (включая восстановление старой версии) добавляет новую строку, ничего не
// перезаписывая, так что список всегда отражает реальную последовательность
// правок, а не только "текущее" и "предыдущее".
export async function openHistory() {
  state.historyOpen = true;
  state.historyLoading = true;
  state.historyError = null;
  try {
    const res = await fetch('api/flows/history');
    if (!res.ok) throw new Error(`GET api/flows/history: ${res.status}`);
    state.historyVersions = await res.json();
  } catch (err) {
    state.historyError = err.message;
  } finally {
    state.historyLoading = false;
  }
}

export function closeHistory() {
  state.historyOpen = false;
}

function confirmRestore() {
  // eslint-disable-next-line no-alert, no-restricted-globals
  return confirm(
    'Восстановить эту версию? Текущее состояние не потеряется — оно тоже останется в истории.'
  );
}

export async function restoreVersion(id) {
  if (!confirmRestore()) return;
  state.historyRestoringId = id;
  try {
    const res = await fetch(`api/flows/history/${id}/restore`, {
      method: 'POST',
    });
    const data = await res.json();
    if (!res.ok) {
      state.saveStatus = {
        ok: false,
        text: (
          data.errors || [data.error || 'не удалось восстановить версию']
        ).join('; '),
      };
      return;
    }
    state.flows = data.flows;
    state.dirty = false;
    state.selectedId = null;
    state.saveStatus = {
      ok: true,
      text: 'Версия восстановлена ' + new Date().toLocaleTimeString(),
    };
    // Панель истории оставляем открытой и перечитываем список — само
    // восстановление тоже стало новой версией и появится сверху, это
    // наглядное подтверждение того, что действие сработало.
    await openHistory();
  } catch (err) {
    state.saveStatus = { ok: false, text: 'Ошибка сети: ' + err.message };
  } finally {
    state.historyRestoringId = null;
  }
}

export function selectNode(id) {
  state.selectedId = id;
}

export function nodePreview(node) {
  if (!node) return '';
  return node.title || node.prompt || node.text || node.message || '';
}

// Дефолтные поля под тип узла — используется и при создании нового узла, и
// при смене типа существующего (иначе шаблон EditPanel обращался бы к
// node.field.name/node.options и т.п. у объекта, где их ещё нет).
function defaultsForType(type, id) {
  const base = { type };
  if (type === 'menu') {
    base.title = 'Новое меню';
    base.options = [];
  }
  if (type === 'question') {
    base.prompt = 'Новый вопрос';
    base.field = { name: `field_${id}`, type: 'text' };
  }
  if (type === 'message') {
    base.text = 'Текст сообщения';
  }
  if (type === 'link') {
    base.text = 'Текст ссылки';
    base.url = '';
    base.linkTitle = 'Ссылка';
  }
  if (type === 'end') {
    base.text = 'Текст завершения';
  }
  if (type === 'submit') {
    base.message = 'Ваша заявка создана, ожидайте решения';
    base.group = '';
  }
  return base;
}

export function addNode(id, type) {
  if (!id || !/^[a-zA-Z0-9_]+$/.test(id))
    throw new Error('id может содержать только латиницу, цифры и _');
  if (state.flows[id]) throw new Error('Узел с таким id уже существует');

  state.flows[id] = defaultsForType(type, id);
  setDirty();
  selectNode(id);
}

export function deleteNode(id) {
  delete state.flows[id];
  if (state.selectedId === id) state.selectedId = null;
  setDirty();
}

export function changeType(id, newType) {
  const preserved = { _ui: state.flows[id]._ui };
  state.flows[id] = { ...defaultsForType(newType, id), ...preserved };
  setDirty();
}

export function touch() {
  setDirty();
}

// ---- Схема: раскладка узлов (BFS от main_menu, дальше — колонка/строка) ----

export function computeLayout() {
  const depth = {};
  const order = {};
  const levelCounts = {};
  const visited = new Set(['main_menu']);
  const queue = [['main_menu', 0]];

  while (queue.length) {
    const [id, d] = queue.shift();
    depth[id] = d;
    levelCounts[d] = levelCounts[d] || 0;
    order[id] = levelCounts[d]++;
    const node = state.flows[id];
    if (!node) continue;
    const nexts = [];
    if (node.type === 'menu' && Array.isArray(node.options)) {
      node.options.forEach(o => {
        if (o.next) nexts.push(o.next);
      });
    }
    if ((node.type === 'question' || node.type === 'message') && node.next)
      nexts.push(node.next);
    nexts.forEach(n => {
      if (state.flows[n] && !visited.has(n)) {
        visited.add(n);
        queue.push([n, d + 1]);
      }
    });
  }

  const maxDepth = Math.max(0, ...Object.values(depth));
  let orphanIndex = 0;
  Object.keys(state.flows).forEach(id => {
    if (!visited.has(id)) {
      depth[id] = maxDepth + 2;
      order[id] = orphanIndex++;
    }
  });

  return { depth, order };
}

export function posFor(id, layout) {
  const node = state.flows[id];
  if (node && node._ui && typeof node._ui.x === 'number') return node._ui;
  const d = layout.depth[id] || 0;
  const o = layout.order[id] || 0;
  return { x: PAD + d * COL_W, y: PAD + o * ROW_H };
}

export function edgesFor(id) {
  const node = state.flows[id];
  const out = [];
  if (!node) return out;
  if (node.type === 'menu' && Array.isArray(node.options)) {
    node.options.forEach(o => {
      if (o.next && state.flows[o.next]) out.push(o.next);
    });
  }
  if (
    (node.type === 'question' || node.type === 'message') &&
    node.next &&
    state.flows[node.next]
  )
    out.push(node.next);
  return out;
}

// Группировка для сайдбара: к какой ветке главного меню относится узел
// (BFS от каждой опции main_menu; недостижимые узлы — отдельная группа).
export function branchGroups() {
  const groups = {};
  const assigned = {};
  const mainMenu = state.flows.main_menu;

  groups.__root__ = ['main_menu'];
  assigned.main_menu = true;

  if (mainMenu && Array.isArray(mainMenu.options)) {
    mainMenu.options.forEach(opt => {
      const key = opt.title || opt.id;
      const queue = opt.next ? [opt.next] : [];
      const seen = {};
      const ids = [];
      while (queue.length) {
        const id = queue.shift();
        if (!id || seen[id] || !state.flows[id]) continue;
        seen[id] = true;
        if (assigned[id]) continue;
        assigned[id] = true;
        ids.push(id);
        const node = state.flows[id];
        if (node.type === 'menu' && Array.isArray(node.options)) {
          node.options.forEach(o => {
            if (o.next) queue.push(o.next);
          });
        }
        if ((node.type === 'question' || node.type === 'message') && node.next)
          queue.push(node.next);
      }
      groups[key] = ids;
    });
  }

  const orphans = Object.keys(state.flows).filter(id => !assigned[id]);
  if (orphans.length) groups['Не подключено к главному меню'] = orphans;

  return groups;
}

export const layoutConstants = { BOX_W, BOX_H, COL_W, ROW_H, PAD };
