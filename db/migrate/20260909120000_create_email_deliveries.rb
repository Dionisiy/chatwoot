class CreateEmailDeliveries < ActiveRecord::Migration[7.1]
  def change
    # Журнал исходящих писем. До него единственным следом отправки были логи
    # Postfix на сервере: из интерфейса нельзя было ответить даже на вопрос
    # «письмо клиенту вообще ушло?». Причём молчаливые потери реальны — письма
    # с ответом агента какое-то время не отправлялись вовсе из-за пустого
    # inbound_email_domain, и заметить это можно было только в очереди Sidekiq.
    #
    # Запись создаётся до передачи письма в MTA и по мере продвижения меняет
    # статус (см. EmailDelivery#status), поэтому строка остаётся и у писем,
    # отправка которых упала с исключением.
    create_table :email_deliveries do |t|
      t.references :account, null: false
      # Письма агентам (уведомления, сброс пароля) к диалогу не относятся,
      # поэтому связь необязательная.
      t.references :conversation, null: true

      # Заголовок Message-ID письма — единственное, что связывает нашу запись
      # со строками в логе Postfix, где лежит настоящий вердикт принимающего
      # сервера (см. Emails::SyncDeliveryStatusJob).
      t.string :message_id, null: false
      t.string :to_email, null: false
      t.string :subject
      # Класс и метод мейлера, например ConversationReplyMailer#reply_with_summary
      t.string :mailer

      t.integer :status, null: false, default: 0
      # Идентификатор письма в очереди Postfix, проставляется при разборе лога.
      t.string :mta_queue_id
      # Дословный ответ принимающего сервера — в нём причина отказа.
      t.text :mta_response
      # Текст исключения, если письмо не удалось даже передать в MTA.
      t.text :error_message
      t.datetime :delivered_at

      t.timestamps
    end

    # Message-ID уникален по построению; индекс нужен ещё и для поиска при
    # разборе лога, который идёт именно по этому полю.
    add_index :email_deliveries, :message_id, unique: true
    add_index :email_deliveries, :mta_queue_id
    # Основной экран журнала — письма аккаунта в обратном хронологическом
    # порядке, с фильтром по статусу.
    add_index :email_deliveries, [:account_id, :created_at]
    add_index :email_deliveries, [:account_id, :status]
  end
end
