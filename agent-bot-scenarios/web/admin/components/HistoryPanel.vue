<script setup>
import { state, closeHistory, restoreVersion } from '../store';

function formatDate(iso) {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
</script>

<template>
  <div v-if="state.historyOpen" class="overlay" @click.self="closeHistory">
    <div class="dialog">
      <div class="dialog-head">
        <h2>История версий</h2>
        <button class="close" type="button" @click="closeHistory">✕</button>
      </div>

      <p class="hint">
        Каждое сохранение — новая версия, ничего не перезаписывается.
        Восстановление старой версии тоже сохраняется как новая запись — текущее
        состояние не теряется.
      </p>

      <div v-if="state.historyLoading" class="empty">Загрузка…</div>
      <div v-else-if="state.historyError" class="empty error">
        Не удалось загрузить историю: {{ state.historyError }}
      </div>
      <div v-else-if="!state.historyVersions.length" class="empty">
        Версий пока нет
      </div>
      <ul v-else class="versions">
        <li v-for="v in state.historyVersions" :key="v.id" class="version-row">
          <div class="version-meta">
            <span class="version-date">{{ formatDate(v.created_at) }}</span>
            <span class="version-author">{{
              v.created_by || 'автор неизвестен'
            }}</span>
          </div>
          <button
            class="small"
            type="button"
            :disabled="state.historyRestoringId === v.id"
            @click="restoreVersion(v.id)"
          >
            {{
              state.historyRestoringId === v.id
                ? 'Восстановление…'
                : 'Восстановить'
            }}
          </button>
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
  width: min(480px, 92vw);
  max-height: 80vh;
  overflow-y: auto;
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
  margin: 4px 0 16px;
}
.empty {
  color: var(--muted-2);
  font-size: 13px;
  padding: 24px 0;
  text-align: center;
}
.empty.error {
  color: #dc2626;
}
.versions {
  list-style: none;
  margin: 0;
  padding: 0;
}
.version-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-soft);
}
.version-row:last-child {
  border-bottom: none;
}
.version-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.version-date {
  font-size: 13px;
  color: var(--text);
}
.version-author {
  font-size: 12px;
  color: var(--muted);
}
button.small {
  font-size: 12px;
  padding: 5px 10px;
  border: 1px solid var(--accent);
  border-radius: 6px;
  background: #fff;
  color: var(--accent);
  cursor: pointer;
  flex-shrink: 0;
}
button.small:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
