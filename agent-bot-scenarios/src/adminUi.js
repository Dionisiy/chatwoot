// Визуальный редактор дерева сценария — /admin. Server-rendered HTML +
// vanilla JS, без внешних CDN (тот же принцип, что и в dashboardView.js).
// Слева — список узлов по веткам, справа — canvas с перетаскиваемыми
// боксами и SVG-стрелками связей, ещё правее — форма редактирования
// выбранного узла. Сохранение шлёт весь объект flows на
// POST /admin/api/flows, сервер валидирует (flowStore.js) и пишет в
// flows.json — движок подхватывает изменения сразу, без рестарта процесса.

function esc(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function renderAdminHtml({ flows, teamNames }) {
  const flowsJson = JSON.stringify(flows).replace(/</g, '\\u003c');
  const teamsJson = JSON.stringify(teamNames || []).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>SlideEdu — редактор сценария</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
  #toolbar { display: flex; align-items: center; gap: 12px; padding: 10px 16px; background: #fff; border-bottom: 1px solid #e2e8f0; position: sticky; top: 0; z-index: 20; }
  #toolbar h1 { font-size: 15px; margin: 0; margin-right: 12px; white-space: nowrap; }
  #toolbar select, #toolbar input, #toolbar button { font-size: 13px; padding: 5px 8px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; }
  #toolbar button { cursor: pointer; background: #2563eb; color: #fff; border-color: #2563eb; font-weight: 600; }
  #toolbar button.secondary { background: #fff; color: #2563eb; }
  #toolbar button:disabled { opacity: .5; cursor: default; }
  #status { font-size: 12px; margin-left: auto; white-space: nowrap; }
  #status.ok { color: #16a34a; }
  #status.err { color: #dc2626; }
  #layout { display: flex; height: calc(100vh - 49px); }
  #sidebar { width: 280px; overflow-y: auto; border-right: 1px solid #e2e8f0; background: #fff; padding: 8px; flex-shrink: 0; }
  #sidebar input.search { width: 100%; margin-bottom: 8px; padding: 6px 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; }
  #sidebar details { margin-bottom: 4px; }
  #sidebar summary { cursor: pointer; font-size: 12px; font-weight: 600; color: #475569; padding: 4px 2px; text-transform: uppercase; }
  .node-item { display: block; padding: 4px 8px; margin: 1px 0 1px 8px; border-radius: 5px; font-size: 12.5px; cursor: pointer; color: #334155; border-left: 3px solid transparent; }
  .node-item:hover { background: #f1f5f9; }
  .node-item.selected { background: #eff6ff; border-left-color: #2563eb; color: #1d4ed8; font-weight: 600; }
  .node-item .tid { font-family: ui-monospace, monospace; color: #94a3b8; font-size: 11px; }
  #canvas-wrap { flex: 1; overflow: auto; position: relative; background:
      radial-gradient(circle, #e2e8f0 1px, transparent 1px) 0 0 / 18px 18px, #f8fafc; }
  #canvas { position: relative; }
  svg#edges { position: absolute; top: 0; left: 0; pointer-events: none; }
  .box { position: absolute; width: 230px; min-height: 64px; background: #fff; border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 8px 10px; cursor: grab; box-shadow: 0 1px 2px rgba(0,0,0,.04); user-select: none; }
  .box:active { cursor: grabbing; }
  .box.selected { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,.15); }
  .box .head { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
  .box .tid { font-family: ui-monospace, monospace; font-size: 10.5px; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge { font-size: 9.5px; font-weight: 700; text-transform: uppercase; padding: 1px 6px; border-radius: 999px; color: #fff; flex-shrink: 0; }
  .badge.menu { background: #2563eb; }
  .badge.question { background: #7c3aed; }
  .badge.message { background: #64748b; }
  .badge.link { background: #0d9488; }
  .badge.end { background: #dc2626; }
  .badge.submit { background: #16a34a; }
  .box .preview { font-size: 12px; color: #334155; line-height: 1.35; max-height: 48px; overflow: hidden; }
  #panel { width: 380px; overflow-y: auto; border-left: 1px solid #e2e8f0; background: #fff; padding: 16px; flex-shrink: 0; }
  #panel h2 { font-size: 13px; margin: 0 0 12px; font-family: ui-monospace, monospace; word-break: break-all; }
  #panel label { display: block; font-size: 12px; font-weight: 600; color: #475569; margin: 12px 0 4px; }
  #panel input[type=text], #panel textarea, #panel select { width: 100%; padding: 6px 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; font-family: inherit; }
  #panel textarea { min-height: 60px; resize: vertical; }
  #panel .opt-row { display: flex; gap: 4px; margin-bottom: 4px; align-items: center; }
  #panel .opt-row input { flex: 1; min-width: 0; }
  #panel .opt-row select { flex: 1; min-width: 0; }
  #panel .opt-row button { flex-shrink: 0; }
  #panel button.small { font-size: 11px; padding: 3px 8px; border: 1px solid #cbd5e1; border-radius: 5px; background: #fff; cursor: pointer; }
  #panel button.danger { color: #dc2626; border-color: #fecaca; background: #fef2f2; }
  #panel .row-actions { margin-top: 20px; padding-top: 12px; border-top: 1px solid #eef2f7; }
  #panel .empty { color: #94a3b8; font-size: 13px; padding: 40px 0; text-align: center; }
  .errbox { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; font-size: 12px; padding: 10px 12px; border-radius: 6px; margin-bottom: 12px; white-space: pre-wrap; }
</style>
</head>
<body>
  <div id="toolbar">
    <h1>Редактор сценария SlideEdu</h1>
    <select id="new-type">
      <option value="message">message</option>
      <option value="menu">menu</option>
      <option value="question">question</option>
      <option value="link">link</option>
      <option value="end">end</option>
      <option value="submit">submit</option>
    </select>
    <input type="text" id="new-id" placeholder="id_нового_узла" style="width:170px">
    <button class="secondary" id="btn-add">+ Добавить узел</button>
    <input type="text" id="search" placeholder="Поиск по id/тексту..." style="width:200px">
    <button id="btn-save">Сохранить всё</button>
    <span id="status"></span>
  </div>
  <div id="layout">
    <div id="sidebar"></div>
    <div id="canvas-wrap"><div id="canvas"><svg id="edges"></svg></div></div>
    <div id="panel"><div class="empty">Выберите узел слева или на схеме</div></div>
  </div>

<script>
var flows = ${flowsJson};
var teamNames = ${teamsJson};
var selectedId = null;
var dirty = false;
var TYPES = ['menu', 'question', 'message', 'link', 'end', 'submit'];
var TERMINAL_TYPES_NO_NEXT = { link: true, end: true, submit: true };

function setDirty(v) {
  dirty = v;
  document.getElementById('btn-save').textContent = v ? 'Сохранить всё *' : 'Сохранить всё';
}

function nodePreview(node) {
  if (!node) return '';
  var t = node.title || node.prompt || node.text || node.message || '';
  return t;
}

function computeLayout() {
  var depth = {}, order = {}, levelCounts = {}, visited = {};
  var queue = [['main_menu', 0]];
  visited['main_menu'] = true;
  while (queue.length) {
    var item = queue.shift();
    var id = item[0], d = item[1];
    depth[id] = d;
    levelCounts[d] = levelCounts[d] || 0;
    order[id] = levelCounts[d]++;
    var node = flows[id];
    if (!node) continue;
    var nexts = [];
    if (node.type === 'menu' && Array.isArray(node.options)) {
      node.options.forEach(function (o) { if (o.next) nexts.push(o.next); });
    }
    if ((node.type === 'question' || node.type === 'message') && node.next) nexts.push(node.next);
    nexts.forEach(function (n) {
      if (flows[n] && !visited[n]) { visited[n] = true; queue.push([n, d + 1]); }
    });
  }
  var maxDepth = 0;
  Object.keys(depth).forEach(function (id) { if (depth[id] > maxDepth) maxDepth = depth[id]; });
  var orphanDepth = maxDepth + 2, orphanIndex = 0;
  Object.keys(flows).forEach(function (id) {
    if (!visited[id]) { depth[id] = orphanDepth; order[id] = orphanIndex++; }
  });
  return { depth: depth, order: order, visited: visited };
}

var layout = computeLayout();
var COLW = 280, ROWH = 130, PAD = 40, BOXW = 230, BOXH = 64;

function posFor(id) {
  var node = flows[id];
  if (node && node._ui && typeof node._ui.x === 'number') return node._ui;
  var d = layout.depth[id] || 0, o = layout.order[id] || 0;
  return { x: PAD + d * COLW, y: PAD + o * ROWH };
}

function branchGroups() {
  // Группировка для сайдбара: к какой ветке главного меню относится узел.
  var groups = {}; // groupKey -> [ids]
  var assigned = {};
  var mainMenu = flows.main_menu;
  groups['__root__'] = ['main_menu'];
  assigned['main_menu'] = true;
  if (mainMenu && Array.isArray(mainMenu.options)) {
    mainMenu.options.forEach(function (opt) {
      var key = opt.title || opt.id;
      var queue = opt.next ? [opt.next] : [];
      var seen = {};
      var ids = [];
      while (queue.length) {
        var id = queue.shift();
        if (!id || seen[id] || !flows[id]) continue;
        seen[id] = true;
        if (assigned[id]) continue;
        assigned[id] = true;
        ids.push(id);
        var node = flows[id];
        if (node.type === 'menu' && Array.isArray(node.options)) {
          node.options.forEach(function (o) { if (o.next) queue.push(o.next); });
        }
        if ((node.type === 'question' || node.type === 'message') && node.next) queue.push(node.next);
      }
      groups[key] = ids;
    });
  }
  var orphans = Object.keys(flows).filter(function (id) { return !assigned[id]; });
  if (orphans.length) groups['Не подключено к главному меню'] = orphans;
  return groups;
}

function renderSidebar(filter) {
  var el = document.getElementById('sidebar');
  var search = document.getElementById('search');
  el = document.getElementById('sidebar');
  var html = '<input type="text" class="search" id="search-inner" placeholder="Поиск по id/тексту..." value="' + esc(filter || '') + '">';
  var groups = branchGroups();
  var q = (filter || '').toLowerCase();
  Object.keys(groups).forEach(function (groupKey) {
    var ids = groups[groupKey].filter(function (id) {
      if (!q) return true;
      var node = flows[id];
      return id.toLowerCase().indexOf(q) >= 0 || nodePreview(node).toLowerCase().indexOf(q) >= 0;
    });
    if (!ids.length) return;
    var title = groupKey === '__root__' ? 'Главное меню' : groupKey;
    html += '<details open><summary>' + esc(title) + ' (' + ids.length + ')</summary>';
    ids.forEach(function (id) {
      var node = flows[id];
      var cls = 'node-item' + (id === selectedId ? ' selected' : '');
      html += '<div class="' + cls + '" data-id="' + esc(id) + '">' +
        '<span class="tid">' + esc(id) + '</span><br>' + esc((nodePreview(node) || '').slice(0, 60)) + '</div>';
    });
    html += '</details>';
  });
  el.innerHTML = html;
  el.querySelectorAll('.node-item').forEach(function (elm) {
    elm.addEventListener('click', function () { selectNode(elm.getAttribute('data-id')); });
  });
  var s = document.getElementById('search-inner');
  s.addEventListener('input', function () { renderSidebar(s.value); s.focus(); s.setSelectionRange(s.value.length, s.value.length); });
}

function edgesFor(id) {
  var node = flows[id];
  var out = [];
  if (!node) return out;
  if (node.type === 'menu' && Array.isArray(node.options)) {
    node.options.forEach(function (o) { if (o.next && flows[o.next]) out.push(o.next); });
  }
  if ((node.type === 'question' || node.type === 'message') && node.next && flows[node.next]) out.push(node.next);
  return out;
}

function renderCanvas() {
  var canvas = document.getElementById('canvas');
  var svg = document.getElementById('edges');
  var maxX = 0, maxY = 0;
  var boxesHtml = '';
  Object.keys(flows).forEach(function (id) {
    var p = posFor(id);
    maxX = Math.max(maxX, p.x + BOXW);
    maxY = Math.max(maxY, p.y + BOXH);
    var node = flows[id];
    var cls = 'box' + (id === selectedId ? ' selected' : '');
    boxesHtml += '<div class="' + cls + '" data-id="' + esc(id) + '" style="left:' + p.x + 'px; top:' + p.y + 'px">' +
      '<div class="head"><span class="badge ' + esc(node.type) + '">' + esc(node.type) + '</span>' +
      '<span class="tid">' + esc(id) + '</span></div>' +
      '<div class="preview">' + esc((nodePreview(node) || '').slice(0, 90)) + '</div></div>';
  });
  canvas.style.width = (maxX + 200) + 'px';
  canvas.style.height = (maxY + 200) + 'px';
  canvas.innerHTML = '<svg id="edges" width="' + (maxX + 200) + '" height="' + (maxY + 200) + '"></svg>' + boxesHtml;

  redrawEdges();

  canvas.querySelectorAll('.box').forEach(function (box) {
    box.addEventListener('mousedown', function (ev) {
      var id = box.getAttribute('data-id');
      selectNode(id);
      var startX = ev.clientX, startY = ev.clientY;
      var origLeft = parseFloat(box.style.left), origTop = parseFloat(box.style.top);
      function onMove(mv) {
        var dx = mv.clientX - startX, dy = mv.clientY - startY;
        var nx = origLeft + dx, ny = origTop + dy;
        box.style.left = nx + 'px';
        box.style.top = ny + 'px';
        if (!flows[id]._ui) flows[id]._ui = {};
        flows[id]._ui.x = nx;
        flows[id]._ui.y = ny;
        redrawEdges();
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        setDirty(true);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      ev.preventDefault();
    });
  });
}

function redrawEdges() {
  var svg = document.getElementById('edges');
  if (!svg) return;
  var paths = '';
  Object.keys(flows).forEach(function (id) {
    var p1 = posFor(id);
    edgesFor(id).forEach(function (targetId) {
      var p2 = posFor(targetId);
      var x1 = p1.x + BOXW, y1 = p1.y + BOXH / 2;
      var x2 = p2.x, y2 = p2.y + BOXH / 2;
      var mx = (x1 + x2) / 2;
      paths += '<path d="M ' + x1 + ' ' + y1 + ' C ' + mx + ' ' + y1 + ', ' + mx + ' ' + y2 + ', ' + x2 + ' ' + y2 +
        '" stroke="#94a3b8" stroke-width="1.5" fill="none" marker-end="url(#arrow)"/>';
    });
  });
  svg.innerHTML = '<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#94a3b8"/></marker></defs>' + paths;
}

function allIdOptions(selected, allowEmpty) {
  var html = allowEmpty ? '<option value="">— нет —</option>' : '';
  Object.keys(flows).sort().forEach(function (id) {
    html += '<option value="' + esc(id) + '"' + (id === selected ? ' selected' : '') + '>' + esc(id) + '</option>';
  });
  return html;
}

function selectNode(id) {
  selectedId = id;
  renderSidebar(document.getElementById('search-inner') ? document.getElementById('search-inner').value : '');
  document.querySelectorAll('.box').forEach(function (b) {
    b.classList.toggle('selected', b.getAttribute('data-id') === id);
  });
  renderPanel();
}

function scrollToNode(id) {
  var p = posFor(id);
  var wrap = document.getElementById('canvas-wrap');
  wrap.scrollTo({ left: Math.max(0, p.x - 200), top: Math.max(0, p.y - 150), behavior: 'smooth' });
}

function fieldUpdater(id, path) {
  return function (ev) {
    var val = ev.target.value;
    var node = flows[id];
    var parts = path.split('.');
    var obj = node;
    for (var i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
    obj[parts[parts.length - 1]] = val;
    setDirty(true);
    renderCanvasBoxPreview(id);
  };
}

function renderCanvasBoxPreview(id) {
  var box = document.querySelector('.box[data-id="' + id.replace(/"/g, '') + '"]');
  if (box) {
    var el = box.querySelector('.preview');
    if (el) el.textContent = (nodePreview(flows[id]) || '').slice(0, 90);
  }
}

function renderPanel() {
  var panel = document.getElementById('panel');
  if (!selectedId || !flows[selectedId]) {
    panel.innerHTML = '<div class="empty">Выберите узел слева или на схеме</div>';
    return;
  }
  var id = selectedId;
  var node = flows[id];
  var html = '<h2>' + esc(id) + '</h2>';
  html += '<label>Тип узла</label><select id="f-type">' + TYPES.map(function (t) {
    return '<option value="' + t + '"' + (t === node.type ? ' selected' : '') + '>' + t + '</option>';
  }).join('') + '</select>';

  if (node.type === 'menu') {
    html += '<label>Заголовок меню</label><textarea id="f-title">' + esc(node.title) + '</textarea>';
    html += '<label>Варианты</label><div id="f-options">';
    (node.options || []).forEach(function (o, i) {
      html += '<div class="opt-row" data-i="' + i + '">' +
        '<input type="text" class="opt-title" placeholder="текст кнопки" value="' + esc(o.title) + '">' +
        '<select class="opt-next">' + allIdOptions(o.next, true) + '</select>' +
        '<button class="small danger opt-del" type="button">✕</button></div>';
    });
    html += '</div><button class="small" id="btn-add-option" type="button">+ Добавить вариант</button>';
  } else if (node.type === 'question') {
    html += '<label>Текст вопроса</label><textarea id="f-prompt">' + esc(node.prompt) + '</textarea>';
    html += '<label>Имя поля (field.name)</label><input type="text" id="f-field-name" value="' + esc(node.field && node.field.name) + '">';
    var ftype = (node.field && node.field.type) || 'text';
    html += '<label>Тип поля</label><select id="f-field-type">' +
      ['text', 'email', 'select'].map(function (t) { return '<option value="' + t + '"' + (t === ftype ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select>';
    html += '<div id="f-select-options" style="' + (ftype === 'select' ? '' : 'display:none') + '">' +
      '<label>Варианты (через запятую)</label><input type="text" id="f-field-options" value="' +
      esc((node.field && node.field.options || []).join(', ')) + '"></div>';
    html += '<label>Следующий узел</label><select id="f-next">' + allIdOptions(node.next, true) + '</select>';
  } else if (node.type === 'message') {
    html += '<label>Текст сообщения</label><textarea id="f-text">' + esc(node.text) + '</textarea>';
    html += '<label>Следующий узел</label><select id="f-next">' + allIdOptions(node.next, true) + '</select>';
  } else if (node.type === 'link') {
    html += '<label>Текст</label><textarea id="f-text">' + esc(node.text) + '</textarea>';
    html += '<label>URL</label><input type="text" id="f-url" value="' + esc(node.url) + '">';
    html += '<label>Подпись ссылки</label><input type="text" id="f-linkTitle" value="' + esc(node.linkTitle) + '">';
  } else if (node.type === 'end') {
    html += '<label>Текст</label><textarea id="f-text">' + esc(node.text) + '</textarea>';
  } else if (node.type === 'submit') {
    html += '<label>Текст после отправки заявки</label><textarea id="f-message">' + esc(node.message) + '</textarea>';
    html += '<label>Команда (Chatwoot Team)</label><input type="text" id="f-group" list="teams-list" value="' + esc(node.group) + '">' +
      '<datalist id="teams-list">' + teamNames.map(function (t) { return '<option value="' + esc(t) + '">'; }).join('') + '</datalist>';
  }

  html += '<div class="row-actions">' +
    '<button class="small" id="btn-goto" type="button">Показать на схеме</button> ' +
    '<button class="small danger" id="btn-delete" type="button">Удалить узел</button></div>';

  panel.innerHTML = html;

  var typeSel = document.getElementById('f-type');
  typeSel.addEventListener('change', function () {
    var newType = typeSel.value;
    var preserved = { _ui: node._ui };
    flows[id] = Object.assign({ type: newType }, preserved);
    setDirty(true);
    renderPanel();
    renderCanvas();
  });

  if (node.type === 'menu') {
    document.getElementById('f-title').addEventListener('input', fieldUpdater(id, 'title'));
    document.getElementById('btn-add-option').addEventListener('click', function () {
      node.options = node.options || [];
      node.options.push({ id: 'opt_' + Math.random().toString(36).slice(2, 7), title: 'Новый вариант', next: '' });
      setDirty(true);
      renderPanel();
    });
    document.querySelectorAll('#f-options .opt-row').forEach(function (row) {
      var i = parseInt(row.getAttribute('data-i'), 10);
      row.querySelector('.opt-title').addEventListener('input', function (ev) {
        node.options[i].title = ev.target.value;
        setDirty(true);
        renderCanvasBoxPreview(id);
      });
      row.querySelector('.opt-next').addEventListener('change', function (ev) {
        node.options[i].next = ev.target.value;
        setDirty(true);
        renderCanvas();
        selectNode(id);
      });
      row.querySelector('.opt-del').addEventListener('click', function () {
        node.options.splice(i, 1);
        setDirty(true);
        renderPanel();
        renderCanvas();
      });
    });
  } else if (node.type === 'question') {
    document.getElementById('f-prompt').addEventListener('input', fieldUpdater(id, 'prompt'));
    document.getElementById('f-field-name').addEventListener('input', function (ev) {
      node.field = node.field || {};
      node.field.name = ev.target.value;
      setDirty(true);
    });
    document.getElementById('f-field-type').addEventListener('change', function (ev) {
      node.field = node.field || {};
      node.field.type = ev.target.value;
      setDirty(true);
      renderPanel();
    });
    var selOptsInput = document.getElementById('f-field-options');
    if (selOptsInput) {
      selOptsInput.addEventListener('input', function (ev) {
        node.field.options = ev.target.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        setDirty(true);
      });
    }
    document.getElementById('f-next').addEventListener('change', function (ev) {
      node.next = ev.target.value || undefined;
      setDirty(true);
      renderCanvas();
      selectNode(id);
    });
  } else if (node.type === 'message') {
    document.getElementById('f-text').addEventListener('input', fieldUpdater(id, 'text'));
    document.getElementById('f-next').addEventListener('change', function (ev) {
      node.next = ev.target.value || undefined;
      setDirty(true);
      renderCanvas();
      selectNode(id);
    });
  } else if (node.type === 'link') {
    document.getElementById('f-text').addEventListener('input', fieldUpdater(id, 'text'));
    document.getElementById('f-url').addEventListener('input', fieldUpdater(id, 'url'));
    document.getElementById('f-linkTitle').addEventListener('input', fieldUpdater(id, 'linkTitle'));
  } else if (node.type === 'end') {
    document.getElementById('f-text').addEventListener('input', fieldUpdater(id, 'text'));
  } else if (node.type === 'submit') {
    document.getElementById('f-message').addEventListener('input', fieldUpdater(id, 'message'));
    document.getElementById('f-group').addEventListener('input', fieldUpdater(id, 'group'));
  }

  document.getElementById('btn-goto').addEventListener('click', function () { scrollToNode(id); });
  document.getElementById('btn-delete').addEventListener('click', function () {
    if (!confirm('Удалить узел "' + id + '"? Ссылки на него из других узлов придётся поправить вручную.')) return;
    delete flows[id];
    selectedId = null;
    setDirty(true);
    layout = computeLayout();
    renderSidebar('');
    renderCanvas();
    renderPanel();
  });
}

document.getElementById('btn-add').addEventListener('click', function () {
  var id = document.getElementById('new-id').value.trim();
  var type = document.getElementById('new-type').value;
  if (!id) { alert('Укажите id нового узла'); return; }
  if (!/^[a-zA-Z0-9_]+$/.test(id)) { alert('id может содержать только латиницу, цифры и _'); return; }
  if (flows[id]) { alert('Узел с таким id уже существует'); return; }
  var base = { type: type };
  if (type === 'menu') { base.title = 'Новое меню'; base.options = []; }
  if (type === 'question') { base.prompt = 'Новый вопрос'; base.field = { name: 'field_' + id, type: 'text' }; }
  if (type === 'message') { base.text = 'Текст сообщения'; }
  if (type === 'link') { base.text = 'Текст ссылки'; base.url = ''; base.linkTitle = 'Ссылка'; }
  if (type === 'end') { base.text = 'Текст завершения'; }
  if (type === 'submit') { base.message = 'Ваша заявка создана, ожидайте решения'; base.group = ''; }
  flows[id] = base;
  document.getElementById('new-id').value = '';
  setDirty(true);
  layout = computeLayout();
  renderSidebar('');
  renderCanvas();
  selectNode(id);
});

document.getElementById('btn-save').addEventListener('click', function () {
  var statusEl = document.getElementById('status');
  statusEl.textContent = 'Сохранение...';
  statusEl.className = '';
  var clean = {};
  Object.keys(flows).forEach(function (id) { clean[id] = flows[id]; });
  fetch('/admin/api/flows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(clean),
  }).then(function (res) {
    return res.json().then(function (data) { return { ok: res.ok, data: data }; });
  }).then(function (r) {
    if (!r.ok) {
      statusEl.textContent = 'Ошибка';
      statusEl.className = 'err';
      alert('Не удалось сохранить:\\n' + (r.data.errors || [r.data.error || 'неизвестная ошибка']).join('\\n'));
      return;
    }
    statusEl.textContent = 'Сохранено ' + new Date().toLocaleTimeString();
    statusEl.className = 'ok';
    setDirty(false);
  }).catch(function (e) {
    statusEl.textContent = 'Ошибка сети';
    statusEl.className = 'err';
  });
});

window.addEventListener('beforeunload', function (e) {
  if (dirty) { e.preventDefault(); e.returnValue = ''; }
});

renderSidebar('');
renderCanvas();
renderPanel();
</script>
</body>
</html>`;
}

module.exports = { renderAdminHtml };
