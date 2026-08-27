<script setup>
import { ref } from 'vue';
import { state, TYPES, addNode, save, openHistory } from '../store';

const newId = ref('');
const newType = ref('message');

function onAdd() {
  try {
    addNode(newId.value.trim(), newType.value);
    newId.value = '';
  } catch (err) {
    // eslint-disable-next-line no-alert
    alert(err.message);
  }
}
</script>

<template>
  <div id="toolbar">
    <h1>Редактор сценария SlideEdu</h1>

    <select v-model="newType">
      <option v-for="t in TYPES" :key="t" :value="t">{{ t }}</option>
    </select>
    <input
      v-model="newId"
      type="text"
      placeholder="id_нового_узла"
      style="width: 170px"
      @keyup.enter="onAdd"
    />
    <button class="secondary" type="button" @click="onAdd">
      + Добавить узел
    </button>

    <input
      v-model="state.search"
      type="text"
      placeholder="Поиск по id/тексту..."
      style="width: 200px"
    />

    <button type="button" :disabled="state.saving" @click="save">
      {{
        state.saving
          ? 'Сохранение…'
          : state.dirty
            ? 'Сохранить всё *'
            : 'Сохранить всё'
      }}
    </button>
    <button class="secondary" type="button" @click="openHistory">
      История
    </button>
    <span
      v-if="state.saveStatus"
      id="status"
      :class="state.saveStatus.ok ? 'ok' : 'err'"
      >{{ state.saveStatus.text }}</span>
  </div>
</template>

<style scoped>
#toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: #fff;
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 20;
}
#toolbar h1 {
  font-size: 15px;
  margin: 0 12px 0 0;
  white-space: nowrap;
}
#toolbar select,
#toolbar input,
#toolbar button {
  font-size: 13px;
  padding: 5px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
}
#toolbar button {
  cursor: pointer;
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
  font-weight: 600;
}
#toolbar button.secondary {
  background: #fff;
  color: var(--accent);
}
#toolbar button:disabled {
  opacity: 0.5;
  cursor: default;
}
#status {
  font-size: 12px;
  margin-left: auto;
  white-space: nowrap;
}
#status.ok {
  color: #16a34a;
}
#status.err {
  color: #dc2626;
}
</style>
