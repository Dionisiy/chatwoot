json.meta do
  json.total_count @total_count
  json.current_page @deliveries.current_page
  json.total_pages @deliveries.total_pages
end

json.payload do
  json.array! @deliveries do |delivery|
    json.id delivery.id
    json.status delivery.status
    json.to_email delivery.to_email
    json.subject delivery.subject
    json.mailer delivery.mailer
    json.message_id delivery.message_id
    # Ответ принимающего сервера — в нём причина отказа, ради неё журнал и
    # затевался. Может быть длинным, обрезать не стоит.
    json.mta_response delivery.mta_response
    json.error_message delivery.error_message
    json.delivered_at delivery.delivered_at
    json.created_at delivery.created_at

    # Номер диалога нужен, чтобы из журнала можно было перейти к переписке.
    json.conversation_id delivery.conversation_id
    json.conversation_display_id delivery.conversation&.display_id
    # Повторно отправить можно только письма по диалогу: тело письма не
    # хранится, мейлер собирает его заново из самого диалога.
    json.resendable delivery.conversation_id.present?
  end
end
