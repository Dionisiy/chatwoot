const axios = require('axios');

// Прямой запрос к SlideEdu из бота — БЕЗ участия фронтенда SlideEdu.
// Раньше (см. engine.js) единственным путём получить список учеников
// учителя было custom_attributes.students на контакте Chatwoot, которые
// должен был проставлять фронтенд SlideEdu через
// window.$chatwoot.setUser()/setCustomAttributes() при логине — то есть
// фича зависела от правки в отдельном репозитории, до которого у нас нет
// доступа. Email контакта Chatwoot уже знает из уже работающего,
// независимого identity-потока (фронтенд и так передаёт email в setUser()
// при логине, см. живую проверку идентификации) — здесь бот сам стучится
// в Laravel по этому email, минуя фронтенд полностью.
//
// Аутентификация — общий секрет (заголовок X-Chat-Bot-Secret), а не
// личный Sanctum-токен пользователя: с этой стороны нет браузера
// залогиненного человека, есть только сам бот-сервис — см.
// ChatIntegrationController::studentsForEmail на стороне Laravel.
function createSlideEduClient({ baseUrl, sharedSecret } = {}) {
  if (!baseUrl || !sharedSecret) {
    // SLIDEEDU_BASE_URL/CHAT_BOT_SHARED_SECRET ещё не заданы в .env — не
    // ошибка, а штатное состояние до настройки обеих сторон. Список
    // учеников просто недоступен, вопрос ФИО остаётся обычным текстовым
    // (см. renderNode/student_select) — как было раньше.
    return {
      async getStudentsByEmail() {
        return [];
      },
    };
  }

  const http = axios.create({
    baseURL: baseUrl,
    headers: { 'X-Chat-Bot-Secret': sharedSecret },
    timeout: 5000,
  });

  return {
    async getStudentsByEmail(email) {
      if (!email) return [];
      try {
        const { data } = await http.get('/api/chat/students', { params: { email } });
        return Array.isArray(data.students) ? data.students : [];
      } catch (err) {
        console.error('[slideeduClient] getStudentsByEmail failed:', err.message);
        return [];
      }
    },
  };
}

module.exports = { createSlideEduClient };
