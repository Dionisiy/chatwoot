/* global axios */
import ApiClient from './ApiClient';

class ProblemTypesAPI extends ApiClient {
  constructor() {
    super('problem_types', { accountScoped: true });
  }

  // Возвращает существующий тип, если такое название уже есть у метки
  // (сравнение без учёта регистра, ё/е и пунктуации — см. ProblemType.normalize).
  create({ labelTitle, name }) {
    return axios.post(this.url, { label_title: labelTitle, name });
  }
}

export default new ProblemTypesAPI();
