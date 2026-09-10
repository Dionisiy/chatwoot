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

  # Кого показать в отчёте CSAT как обработавшего заявку.
  #
  # Апстрим берёт conversation.assignee — того, на кого диалог назначен
  # формально. При включённом автоназначении это ломает отчёт: round-robin
  # вешает диалог на одного агента, отвечает клиенту в итоге другой, и оценку
  # клиента получает тот, кто заявки не касался. Реально видели ровно это —
  # диалог вёл один оператор, а в отчёте стоял другой.
  #
  # Поэтому сначала спрашиваем, кто последним написал клиенту живым ответом,
  # и только если таких нет — возвращаемся к назначенному.
  def handling_agent(conversation)
    last_human_responder(conversation) || conversation.assignee
  end

  # Именно sender_type 'User': исходящие сообщения шлёт ещё и бот-сценарий
  # (AgentBot), и засчитывать его за обработавшего оператора нельзя — иначе
  # у каждой заявки был бы «обработавший», даже если человек её не открывал.
  def last_human_responder(conversation)
    conversation.messages.outgoing.where(sender_type: 'User').order(:id).last&.sender
  end
end
