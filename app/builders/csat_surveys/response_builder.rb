class CsatSurveys::ResponseBuilder
  pattr_initialize [:message]

  def perform
    raise 'Invalid Message' unless message.input_csat?

    conversation = message.conversation
    rating = message.content_attributes.dig('submitted_values', 'csat_survey_response', 'rating')
    feedback_message = message.content_attributes.dig('submitted_values', 'csat_survey_response', 'feedback_message')

    return if rating.blank?

    process_csat_response(conversation, rating, feedback_message)
  end

  private

  def process_csat_response(conversation, rating, feedback_message)
    csat_survey_response = message.csat_survey_response || CsatSurveyResponse.new(
      message_id: message.id, account_id: message.account_id, conversation_id: message.conversation_id,
      contact_id: conversation.contact_id, assigned_agent: handling_agent(conversation)
    )
    csat_survey_response.rating = rating
    csat_survey_response.feedback_message = feedback_message
    csat_survey_response.save!
    csat_survey_response
  end

  # Кого показать в отчёте CSAT как обработавшего заявку: того, кто последним
  # ответил клиенту живым сообщением. Если не отвечал никто — nil, и отчёт
  # честно показывает, что заявку человек не вёл.
  #
  # Апстрим брал conversation.assignee, то есть назначенного формально, и это
  # ломало отчёт дважды. Во-первых, при автоназначении round-robin вешает
  # диалог на одного агента, а отвечает клиенту другой — оценку получал тот,
  # кто заявки не касался. Во-вторых, у заявок, где оператор не написал ни
  # слова (клиент сам закрыл диалог кнопкой в виджете), в отчёте всё равно
  # стоял агент, приписывая ему чужую оценку.
  #
  # Именно sender_type 'User': исходящие сообщения шлёт ещё и бот-сценарий
  # (AgentBot), и засчитывать его за обработавшего оператора нельзя — иначе
  # «обработавший» находился бы у каждой заявки, даже не открытой человеком.
  def handling_agent(conversation)
    conversation.messages.outgoing.where(sender_type: 'User').order(:id).last&.sender
  end
end
