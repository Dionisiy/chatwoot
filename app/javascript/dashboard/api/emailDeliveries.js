/* global axios */
import ApiClient from './ApiClient';

class EmailDeliveriesAPI extends ApiClient {
  constructor() {
    super('email_deliveries', { accountScoped: true });
  }

  get({ page = 1, status = '', conversationId = '' } = {}) {
    return axios.get(this.url, {
      params: {
        page,
        // Пустые значения не отправляем: контроллер считает наличие параметра
        // за просьбу отфильтровать, и status='' отсеял бы вообще всё.
        ...(status ? { status } : {}),
        ...(conversationId ? { conversation_id: conversationId } : {}),
      },
    });
  }

  resend(id) {
    return axios.post(`${this.url}/${id}/resend`);
  }
}

export default new EmailDeliveriesAPI();
