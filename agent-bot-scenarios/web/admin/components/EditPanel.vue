<script setup>
import { computed } from 'vue';
import { state, TYPES, changeType, deleteNode, touch } from '../store';
import { readBase, writeBase, hasTranslations } from '../translations';

// Переводимые поля (заголовки, вопросы, тексты) хранятся либо строкой, либо
// объектом { ru, uk, en } — см. src/i18n.js. Здесь всегда правится русский
// оригинал, а переводы, если они есть, остаются нетронутыми; менять их —
// на отдельном экране «Переводы» (кнопка в тулбаре).
function setBase(owner, key, text) {
  owner[key] = writeBase(owner[key], text);
  touch();
}

const id = computed(() => state.selectedId);
const node = computed(() => (id.value ? state.flows[id.value] : null));

const allIds = computed(() => Object.keys(state.flows).sort());

function onTypeChange(ev) {
  changeType(id.value, ev.target.value);
}

function addOption() {
  node.value.options = node.value.options || [];
  node.value.options.push({
    id: `opt_${Math.random().toString(36).slice(2, 7)}`,
    title: 'Новый вариант',
    next: '',
  });
  touch();
}

function removeOption(i) {
  node.value.options.splice(i, 1);
  touch();
}

function onDelete() {
  // eslint-disable-next-line no-alert
  if (
    !confirm(
      `Удалить узел "${id.value}"? Ссылки на него из других узлов придётся поправить вручную.`
    )
  )
    return;
  deleteNode(id.value);
}

function goto() {
  state.scrollTarget = id.value;
}

const selectFieldOptionsText = computed({
  get() {
    return (
      (node.value && node.value.field && node.value.field.options) ||
      []
    ).join(', ');
  },
  set(v) {
    node.value.field.options = v
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    touch();
  },
});
</script>

<template>
  <div id="panel">
    <div v-if="!node" class="empty">Выберите узел слева или на схеме</div>

    <template v-else>
      <h2>{{ id }}</h2>

      <label>Тип узла</label>
      <select :value="node.type" @change="onTypeChange">
        <option v-for="t in TYPES" :key="t" :value="t">{{ t }}</option>
      </select>

      <template v-if="node.type === 'menu'">
        <label>
          Заголовок меню
          <span v-if="hasTranslations(node.title)" class="tr-badge">
            есть переводы
          </span>
        </label>
        <textarea
          :value="readBase(node.title)"
          @input="setBase(node, 'title', $event.target.value)"
        />

        <label>Варианты</label>
        <div v-for="(o, i) in node.options" :key="i" class="opt-row">
          <input
            :value="readBase(o.title)"
            type="text"
            placeholder="текст кнопки"
            @input="setBase(o, 'title', $event.target.value)"
          />
          <select v-model="o.next" @change="touch">
            <option value="">— нет —</option>
            <option v-for="oid in allIds" :key="oid" :value="oid">
              {{ oid }}
            </option>
          </select>
          <button class="small danger" type="button" @click="removeOption(i)">
            ✕
          </button>
        </div>
        <button class="small" type="button" @click="addOption">
          + Добавить вариант
        </button>
      </template>

      <template v-else-if="node.type === 'question'">
        <label>
          Текст вопроса
          <span v-if="hasTranslations(node.prompt)" class="tr-badge">
            есть переводы
          </span>
        </label>
        <textarea
          :value="readBase(node.prompt)"
          @input="setBase(node, 'prompt', $event.target.value)"
        />

        <label>Имя поля (field.name)</label>
        <input v-model="node.field.name" type="text" @input="touch" />

        <label>Тип поля</label>
        <select v-model="node.field.type" @change="touch">
          <option value="text">text</option>
          <option value="email">email</option>
          <option value="select">select</option>
          <option value="date">date</option>
          <option value="student_select">student_select</option>
        </select>

        <template v-if="node.field.type === 'select'">
          <label>Варианты (через запятую)</label>
          <input v-model="selectFieldOptionsText" type="text" />
        </template>

        <template v-if="node.field.type === 'student_select'">
          <p class="hint">
            Список учеников подтягивается автоматически из SlideEdu
            (contactAttributes.students) — вариантов вручную вводить не нужно.
            Если у контакта нет списка учеников, вопрос покажется как обычный
            текстовый.
          </p>
        </template>

        <label>Следующий узел</label>
        <select v-model="node.next" @change="touch">
          <option value="">— нет —</option>
          <option v-for="oid in allIds" :key="oid" :value="oid">
            {{ oid }}
          </option>
        </select>
      </template>

      <template v-else-if="node.type === 'message'">
        <label>
          Текст сообщения
          <span v-if="hasTranslations(node.text)" class="tr-badge">
            есть переводы
          </span>
        </label>
        <textarea
          :value="readBase(node.text)"
          @input="setBase(node, 'text', $event.target.value)"
        />
        <label>Следующий узел</label>
        <select v-model="node.next" @change="touch">
          <option value="">— нет —</option>
          <option v-for="oid in allIds" :key="oid" :value="oid">
            {{ oid }}
          </option>
        </select>
      </template>

      <template v-else-if="node.type === 'link'">
        <label>
          Текст
          <span v-if="hasTranslations(node.text)" class="tr-badge">
            есть переводы
          </span>
        </label>
        <textarea
          :value="readBase(node.text)"
          @input="setBase(node, 'text', $event.target.value)"
        />
        <label>URL</label>
        <input v-model="node.url" type="text" @input="touch" />
        <label>Подпись ссылки</label>
        <input
          :value="readBase(node.linkTitle)"
          type="text"
          @input="setBase(node, 'linkTitle', $event.target.value)"
        />
      </template>

      <template v-else-if="node.type === 'end'">
        <label>
          Текст
          <span v-if="hasTranslations(node.text)" class="tr-badge">
            есть переводы
          </span>
        </label>
        <textarea
          :value="readBase(node.text)"
          @input="setBase(node, 'text', $event.target.value)"
        />
      </template>

      <template v-else-if="node.type === 'submit'">
        <label>
          Текст после отправки заявки
          <span v-if="hasTranslations(node.message)" class="tr-badge">
            есть переводы
          </span>
        </label>
        <textarea
          :value="readBase(node.message)"
          @input="setBase(node, 'message', $event.target.value)"
        />
        <label>Команда (Chatwoot Team)</label>
        <input
          v-model="node.group"
          type="text"
          list="teams-list"
          @input="touch"
        />
        <datalist id="teams-list">
          <option v-for="t in state.teamNames" :key="t" :value="t" />
        </datalist>
        <label>Оператор (автоназначение, необязательно)</label>
        <input
          v-model="node.assignee"
          type="text"
          list="agents-list"
          @input="touch"
        />
        <datalist id="agents-list">
          <option v-for="a in state.agentNames" :key="a" :value="a" />
        </datalist>
      </template>

      <div class="row-actions">
        <button class="small" type="button" @click="goto">
          Показать на схеме
        </button>
        <button class="small danger" type="button" @click="onDelete">
          Удалить узел
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
#panel {
  width: 380px;
  overflow-y: auto;
  border-left: 1px solid var(--border);
  background: #fff;
  padding: 16px;
  flex-shrink: 0;
}
h2 {
  font-size: 13px;
  margin: 0 0 12px;
  font-family: ui-monospace, monospace;
  word-break: break-all;
}
label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  margin: 12px 0 4px;
}
input[type='text'],
textarea,
select {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
}
textarea {
  min-height: 60px;
  resize: vertical;
}
.hint {
  font-size: 12px;
  color: #64748b;
  margin: 4px 0 0;
  line-height: 1.4;
}
.tr-badge {
  font-weight: 400;
  font-size: 11px;
  color: var(--accent);
  margin-left: 6px;
}
.opt-row {
  display: flex;
  gap: 4px;
  margin-bottom: 4px;
  align-items: center;
}
.opt-row input,
.opt-row select {
  flex: 1;
  min-width: 0;
}
.opt-row button {
  flex-shrink: 0;
}
button.small {
  font-size: 11px;
  padding: 3px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 5px;
  background: #fff;
  cursor: pointer;
}
button.danger {
  color: #dc2626;
  border-color: #fecaca;
  background: #fef2f2;
}
.row-actions {
  margin-top: 20px;
  padding-top: 12px;
  border-top: 1px solid var(--border-soft);
  display: flex;
  gap: 8px;
}
.empty {
  color: var(--muted-2);
  font-size: 13px;
  padding: 40px 0;
  text-align: center;
}
</style>
