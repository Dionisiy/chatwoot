import { ref } from 'vue';
import ProblemTypesAPI from 'dashboard/api/problemTypes';

// Общий на всё приложение кэш справочника типов проблем. Справочник маленький,
// а в Vuex-модуле ему было бы тесно без пользы: состояние нужно только
// выпадающему списку и окну перед закрытием беседы.
const problemTypes = ref([]);
const isFetching = ref(false);

const upsert = problemType => {
  const index = problemTypes.value.findIndex(
    item => item.id === problemType.id
  );
  if (index === -1) {
    problemTypes.value = [...problemTypes.value, problemType];
  } else {
    problemTypes.value.splice(index, 1, problemType);
  }
};

export function useProblemTypes() {
  // Перечитываем при каждом открытии списка: новые типы заводят другие
  // операторы прямо в процессе работы, и держать устаревший кэш нельзя —
  // иначе оператор не увидит чужую свежую запись и создаст дубль.
  const fetchProblemTypes = async () => {
    isFetching.value = true;
    try {
      const { data } = await ProblemTypesAPI.get();
      problemTypes.value = data.payload;
    } finally {
      isFetching.value = false;
    }
  };

  const createProblemType = async ({ labelTitle, name }) => {
    const { data } = await ProblemTypesAPI.create({ labelTitle, name });
    upsert(data.payload);
    return data.payload;
  };

  return { problemTypes, isFetching, fetchProblemTypes, createProblemType };
}
