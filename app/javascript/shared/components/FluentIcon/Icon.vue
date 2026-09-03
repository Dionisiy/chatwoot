<script>
export default {
  props: {
    icon: {
      type: String,
      required: true,
    },
    icons: {
      type: Object,
      required: true,
    },
    size: {
      type: [String, Number],
      default: '20',
    },
    type: {
      type: String,
      default: 'outline',
    },
    viewBox: {
      type: String,
      default: '0 0 24 24',
    },
    iconLib: {
      type: String,
      default: 'fluent',
    },
  },

  computed: {
    pathSource() {
      const key = `${this.icon}-${this.type}`;
      const path = this.icons[key];

      // Неизвестное имя иконки — это опечатка в коде, а не состояние
      // продакшена. Раньше здесь было `path.constructor === Array`, и на
      // отсутствующем ключе падал рендер ВСЕГО компонента-владельца: например,
      // из-за icon="chat-outline" (ключ искался как chat-outline-outline)
      // у кнопки "Начать новую заявку" в виджете пропадала не только иконка,
      // а в консоль на каждой загрузке летел TypeError. Теперь молча не
      // рисуем иконку, но громко пишем в консоль — чтобы опечатку заметили,
      // а интерфейс при этом остался рабочим.
      if (!path) {
        // eslint-disable-next-line no-console
        console.warn(`[FluentIcon] неизвестная иконка: ${key}`);
        return [];
      }

      // Иконка может состоять из нескольких path
      return Array.isArray(path) ? path : [path];
    },
  },
};
</script>

<template>
  <svg
    v-if="iconLib === 'fluent'"
    :width="size"
    :height="size"
    fill="none"
    :viewBox="viewBox"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      v-for="source in pathSource"
      :key="source"
      :d="source"
      fill="currentColor"
    />
  </svg>
  <svg
    v-else
    :width="size"
    :height="size"
    fill="none"
    :viewBox="viewBox"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g v-for="(pathData, index) in pathSource" :key="index">
      <path
        :key="pathData"
        :d="pathData"
        stroke="currentColor"
        stroke-width="1.66667"
      />
    </g>
  </svg>
</template>
