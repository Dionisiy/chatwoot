module Emails
  # Ведёт журнал исходящих писем (EmailDelivery), подключаясь к штатным
  # перехватчикам ActionMailer — см. config/initializers/email_delivery_tracking.rb.
  #
  # Почему два хука, а не один. Observer срабатывает только после успешной
  # передачи письма в MTA, поэтому по нему одному нельзя отличить «письмо не
  # отправляли» от «отправка упала с исключением»: в обоих случаях записи
  # просто нет. Interceptor же вызывается до отправки — он создаёт строку в
  # статусе pending, а observer переводит её в accepted. Строка, застрявшая в
  # pending, и есть упавшая отправка.
  #
  # Ни один из хуков не имеет права уронить отправку письма: журнал —
  # вспомогательная вещь, и его поломка не должна стоить клиенту ответа
  # агента. Поэтому всё обёрнуто в rescue с записью в лог.
  class DeliveryTracker
    # Message-ID писем по диалогу Chatwoot собирает сам, в формате
    # <conversation/UUID/messages/ID@домен> (см. ConversationReplyMailer#
    # custom_message_id). Из него достаём диалог, а через него — аккаунт.
    CONVERSATION_MESSAGE_ID = %r{\Aconversation/(?<uuid>[0-9a-f-]{36})/}i

    class << self
      def before_delivery(message)
        # У писем без явного Message-ID (уведомления агентам) заголовок
        # проставляет сам Mail, но делает это позже — уже при отправке. Нам он
        # нужен раньше, иначе запись и письмо окажутся с разными ID и связать
        # их с логом Postfix будет нечем.
        message.message_id ||= generate_message_id(message)

        conversation = conversation_for(message)
        account = conversation&.account || Current.account
        return if account.blank?

        # Не create!, а поиск с обновлением: Chatwoot строит Message-ID писем
        # по диалогу детерминированно, из uuid диалога и id сообщения, поэтому
        # повторная отправка того же письма даёт тот же идентификатор. Новая
        # попытка должна переписывать историю этой строки, а не падать на
        # уникальности, оставляя в журнале старый вердикт.
        record = EmailDelivery.find_or_initialize_by(message_id: normalize(message.message_id))
        record.assign_attributes(
          account: account,
          conversation: conversation,
          to_email: Array(message.to).join(', '),
          subject: message.subject,
          mailer: mailer_name(message),
          status: :pending,
          mta_queue_id: nil,
          mta_response: nil,
          error_message: nil,
          delivered_at: nil
        )
        record.save!
      rescue StandardError => e
        Rails.logger.error "[email_delivery] не удалось записать письмо в журнал: #{e.message}"
      end

      def after_delivery(message)
        record = find_record(message)
        return if record.blank?

        record.update!(status: :accepted)
      rescue StandardError => e
        Rails.logger.error "[email_delivery] не удалось отметить письмо как принятое: #{e.message}"
      end

      # Вызывается из мейлера, когда отправка упала: превращает зависшую
      # pending-строку в явный failed с текстом ошибки.
      def mark_failed(message, error)
        record = find_record(message)
        return if record.blank?

        record.update!(status: :failed, error_message: error.message)
      rescue StandardError => e
        Rails.logger.error "[email_delivery] не удалось отметить письмо как упавшее: #{e.message}"
      end

      private

      def find_record(message)
        return if message.message_id.blank?

        EmailDelivery.find_by(message_id: normalize(message.message_id))
      end

      def conversation_for(message)
        match = CONVERSATION_MESSAGE_ID.match(normalize(message.message_id))
        return if match.blank?

        Conversation.find_by(uuid: match[:uuid])
      end

      # Mail отдаёт Message-ID то с угловыми скобками, то без — в зависимости
      # от того, читаем мы заголовок или значение. Приводим к одному виду,
      # иначе запись, созданная до отправки, не найдётся после неё.
      def normalize(message_id)
        message_id.to_s.delete('<>').strip
      end

      def generate_message_id(message)
        domain = message.from&.first.to_s.split('@').last.presence || 'localhost'
        "<#{SecureRandom.uuid}@#{domain}>"
      end

      # В письме нет ссылки на мейлер, но ActionMailer кладёт её в служебный
      # заголовок при доставке через очередь. Если его нет — обходимся темой.
      def mailer_name(message)
        message.header['X-Mailer-Class']&.value.presence || 'unknown'
      end
    end
  end
end
