<script setup>
import { computed, ref, watch, nextTick } from 'vue';
import {
  state, computeLayout, posFor, edgesFor, nodePreview, selectNode, touch, layoutConstants,
} from '../store';

const { BOX_W, BOX_H } = layoutConstants;

const canvasWrap = ref(null);

const layout = computed(() => computeLayout());
const nodeIds = computed(() => Object.keys(state.flows));

const positions = computed(() => {
  const map = {};
  nodeIds.value.forEach(id => { map[id] = posFor(id, layout.value); });
  return map;
});

const size = computed(() => {
  let maxX = 0;
  let maxY = 0;
  nodeIds.value.forEach(id => {
    const p = positions.value[id];
    maxX = Math.max(maxX, p.x + BOX_W);
    maxY = Math.max(maxY, p.y + BOX_H);
  });
  return { width: maxX + 200, height: maxY + 200 };
});

const edges = computed(() => {
  const list = [];
  nodeIds.value.forEach(id => {
    const p1 = positions.value[id];
    edgesFor(id).forEach(targetId => {
      const p2 = positions.value[targetId];
      const x1 = p1.x + BOX_W;
      const y1 = p1.y + BOX_H / 2;
      const x2 = p2.x;
      const y2 = p2.y + BOX_H / 2;
      const mx = (x1 + x2) / 2;
      list.push({ key: `${id}->${targetId}`, d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}` });
    });
  });
  return list;
});

let dragging = null;

function onMouseDown(id, ev) {
  selectNode(id);
  const start = positions.value[id];
  dragging = {
    id,
    startX: ev.clientX,
    startY: ev.clientY,
    origX: start.x,
    origY: start.y,
  };
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  ev.preventDefault();
}

function onMouseMove(ev) {
  if (!dragging) return;
  const dx = ev.clientX - dragging.startX;
  const dy = ev.clientY - dragging.startY;
  const node = state.flows[dragging.id];
  if (!node) return;
  node._ui = { x: dragging.origX + dx, y: dragging.origY + dy };
}

function onMouseUp() {
  if (dragging) touch();
  dragging = null;
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mouseup', onMouseUp);
}

watch(() => state.scrollTarget, async id => {
  if (!id || !canvasWrap.value) return;
  await nextTick();
  const p = positions.value[id];
  if (!p) return;
  canvasWrap.value.scrollTo({ left: Math.max(0, p.x - 200), top: Math.max(0, p.y - 150), behavior: 'smooth' });
  state.scrollTarget = null;
});
</script>

<template>
  <div id="canvas-wrap" ref="canvasWrap">
    <div id="canvas" :style="{ width: size.width + 'px', height: size.height + 'px' }">
      <svg :width="size.width" :height="size.height">
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
            <path d="M0,0 L0,6 L7,3 z" fill="#94a3b8" />
          </marker>
        </defs>
        <path
          v-for="e in edges"
          :key="e.key"
          :d="e.d"
          stroke="#94a3b8"
          stroke-width="1.5"
          fill="none"
          marker-end="url(#arrow)"
        />
      </svg>

      <div
        v-for="id in nodeIds"
        :key="id"
        class="box"
        :class="{ selected: id === state.selectedId }"
        :style="{ left: positions[id].x + 'px', top: positions[id].y + 'px' }"
        @mousedown="onMouseDown(id, $event)"
      >
        <div class="head">
          <span class="badge" :class="state.flows[id].type">{{ state.flows[id].type }}</span>
          <span class="tid">{{ id }}</span>
        </div>
        <div class="preview">{{ nodePreview(state.flows[id]).slice(0, 90) }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
#canvas-wrap {
  flex: 1;
  overflow: auto;
  position: relative;
  background:
    radial-gradient(circle, var(--border) 1px, transparent 1px) 0 0 / 18px 18px,
    var(--bg);
}
#canvas { position: relative; }
svg { position: absolute; top: 0; left: 0; pointer-events: none; }

.box {
  position: absolute;
  width: 230px;
  min-height: 64px;
  background: #fff;
  border: 1.5px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  cursor: grab;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  user-select: none;
}
.box:active { cursor: grabbing; }
.box.selected { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15); }
.head { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.tid { font-family: ui-monospace, monospace; font-size: 10.5px; color: var(--muted-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.badge { font-size: 9.5px; font-weight: 700; text-transform: uppercase; padding: 1px 6px; border-radius: 999px; color: #fff; flex-shrink: 0; }
.badge.menu { background: var(--badge-menu); }
.badge.question { background: var(--badge-question); }
.badge.message { background: var(--badge-message); }
.badge.link { background: var(--badge-link); }
.badge.end { background: var(--badge-end); }
.badge.submit { background: var(--badge-submit); }
.preview { font-size: 12px; color: #334155; line-height: 1.35; max-height: 48px; overflow: hidden; }
</style>
