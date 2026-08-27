<script>
import { mapGetters } from 'vuex';

export default {
  components: {},
  props: {
    action: {
      type: Object,
      default: () => {},
    },
    isSelected: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['optionSelect'],
  computed: {
    ...mapGetters({
      widgetColor: 'appConfig/getWidgetColor',
    }),
  },
  methods: {
    onClick() {
      this.$emit('optionSelect', this.action);
    },
  },
};
</script>

<template>
  <li
    class="option w-full max-w-full mb-2 last:mb-0 rounded-xl border border-solid border-n-brand"
    :class="{ 'is-selected': isSelected }"
    :style="{ borderColor: widgetColor }"
  >
    <button
      class="option-button button block w-full bg-transparent border-0 cursor-pointer leading-normal ltr:text-left rtl:text-right whitespace-normal rounded-xl min-h-[2.5rem] py-2.5 px-4"
      @click="onClick"
    >
      <span :style="{ color: widgetColor }">{{ action.title }}</span>
    </button>
  </li>
</template>
