json.payload do
  json.array! @conversations do |conversation|
    # id = display_id (номер заявки) — так же, как в index/create.json.jbuilder
    # и во всём остальном виджете/боте, а не первичный ключ.
    json.id conversation.display_id
    json.status conversation.status
    # Категория заявки — тот же custom_attribute (ключ 'type'), который
    # заполняется в pre-chat форме и используется ботом для маршрутизации
    # (см. agent-bot-scenarios/src/chatwootClient.js#getConversationCategory).
    # Не путать с additional_attributes.
    json.category conversation.custom_attributes['type']
    json.created_at conversation.created_at.to_i
    json.last_activity_at conversation.last_activity_at.to_i
    last_message = conversation.messages.chat.last
    json.last_message last_message&.content
    # Сообщения агента, написанные после того, как клиент последний раз
    # реально открывал именно ЭТОТ тикет (contact_last_seen_at пишется через
    # POST .../update_last_seen — см. conversation/actions.js#setUserLastSeen,
    # который дёргается при заходе в /messages, в т.ч. через "Мои заявки").
    # Ни разу не открывал — считаем непрочитанными все ответы агента.
    seen_since = conversation.contact_last_seen_at || Time.zone.at(0)
    json.unread_count conversation.messages.chat.outgoing.where('messages.created_at > ?', seen_since).count
  end
end
