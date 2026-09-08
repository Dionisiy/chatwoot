<script setup>
import { computed, ref } from 'vue';
import { state, closeTranslations, touch } from '../store';
import {
  TARGET_LOCALES,
  collectEntries,
  readBase,
  readLocale,
  writeLocale,
} from '../translations';

const locale = ref(TARGET_LOCALES[0].code);
const onlyUntranslated = ref(false);
const search = ref('');

const entries = computed(() =>
  state.translationsOpen ? collectEntries(state.flows) : []
);

const translated = computed(
  () => entries.value.filter(e => readLocale(e.get(), locale.value)).length
);

const visible = computed(() => {
  const query = search.value.trim().toLowerCase();
  return entries.value.filter(e => {
    if (onlyUntranslated.value && readLocale(e.get(), locale.value)) {
      return false;
    }
    if (!query) return true;
    return (
      e.nodeId.toLowerCase().includes(query) ||
      readBase(e.get()).toLowerCase().includes(query) ||
      readLocale(e.get(), locale.value).toLowerCase().includes(query)
    );
  });
});

function onInput(entry, text) {
  entry.set(writeLocale(entry.get(), locale.value, text));
  touch();
}
</script>

<template>
  <div
    v-if="state.translationsOpen"
    class="overlay"
    @click.self="closeTranslations"
  >
    <div class="dialog">
      <div class="dialog-head">
        <h2>Переводы сценария</h2>
        <button class="close" type="button" @click="closeTranslations">
          ✕
        </button>
      </div>

      <p class="hint">
        Слева — русский оригинал, справа — перевод. Пустое поле означает, что
        перевода нет: клиенту на этом языке бот покажет русский текст, а не
        пустое сообщение. Изменения попадут в сценарий после «Сохранить всё» —
        как обычная правка, с записью в истории версий.
      </p>

      <div class="controls">
        <select v-model="locale">
          <option v-for="l in TARGET_LOCALES" :key="l.code" :value="l.code">
            {{ l.label }}
          </option>
        </select>
        <input v-model="search" type="text" placeholder="Поиск по тексту…" />
        <label class="check">
          <input v-model="onlyUntranslated" type="checkbox" />
          только непереведённые
        </label>
        <span class="progress"> {{ translated }} из {{ entries.length }} </span>
      </div>

      <div v-if="!visible.length" class="empty">
        {{
          onlyUntranslated
            ? 'Всё переведено'
            : 'Ничего не найдено по этому запросу'
        }}
      </div>
      <ul v-else class="rows">
        <li v-for="entry in visible" :key="entry.id" class="row">
          <div class="source">
            <div class="meta">{{ entry.nodeId }} · {{ entry.label }}</div>
            <div class="original">{{ readBase(entry.get()) }}</div>
          </div>
          <textarea
            :value="readLocale(entry.get(), locale)"
            rows="2"
            :placeholder="'Перевод (' + locale + ')'"
            @input="onInput(entry, $event.target.value)"
          />
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.dialog {
  width: min(980px, 94vw);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 10px;
  padding: 20px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.25);
}
.dialog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}
.dialog-head h2 {
  font-size: 15px;
  margin: 0;
}
.close {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 14px;
  color: var(--muted);
  padding: 2px 6px;
}
.hint {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.4;
  margin: 4px 0 12px;
}
.controls {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-soft);
}
.controls select,
.controls input[type='text'] {
  font-size: 13px;
  padding: 5px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
}
.controls input[type='text'] {
  width: 220px;
}
.check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
}
.progress {
  margin-left: auto;
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
}
.empty {
  color: var(--muted-2);
  font-size: 13px;
  padding: 32px 0;
  text-align: center;
}
.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
}
.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-soft);
}
.row:last-child {
  border-bottom: none;
}
.source {
  min-width: 0;
}
.meta {
  font-size: 11px;
  color: var(--muted-2);
  margin-bottom: 4px;
}
.original {
  font-size: 13px;
  color: var(--text);
  line-height: 1.4;
  white-space: pre-wrap;
}
.row textarea {
  font: inherit;
  font-size: 13px;
  line-height: 1.4;
  padding: 6px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  resize: vertical;
  width: 100%;
}
</style>
