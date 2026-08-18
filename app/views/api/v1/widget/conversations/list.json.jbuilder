json.payload do
  json.array! @conversations do |conversation|
    # id = display_id (номер заявки) — так же, как в index/create.json.jbuilder
    # и во всём остальном виджете/боте, а не первичный ключ.
    json.id conversation.display_id
    json.status conversation.status
    json.created_at conversation.created_at.to_i
    json.last_activity_at conversation.last_activity_at.to_i
    last_message = conversation.messages.chat.last
    json.last_message last_message&.content
  end
end
