module Emails
  # Проставляет письмам в журнале (EmailDelivery) настоящий вердикт
  # принимающего сервера, разбирая лог Postfix.
  #
  # Зачем вообще лог. ActionMailer знает только то, что письмо принял локальный
  # MTA, — на этом его ответственность заканчивается. Дошло ли письмо до
  # адресата, отбито ли и с какой формулировкой, знает только Postfix, и
  # рассказывает он это исключительно в лог. Именно там лежали ответы Gmail
  # вида «does not have a PTR record setup», которые из интерфейса не были
  # видны никак.
  #
  # Postfix пишет о письме двумя разными строками, связанными идентификатором
  # очереди:
  #   postfix/cleanup[..]: 5403518B479: message-id=<...>
  #   postfix/smtp[..]:    5403518B479: to=<...>, ..., status=sent (250 OK)
  # Поэтому за один проход собираем обе половины и только потом сводим их.
  class SyncDeliveryStatusJob < ApplicationJob
    queue_as :scheduled_jobs

    # Текущий лог и вчерашний: письмо, отправленное перед полуночной ротацией,
    # получит вердикт уже в новом файле. Сжатые архивы не трогаем — вердикт
    # старше суток всё равно неинтересен.
    LOG_PATHS = ['/var/log/mail.log', '/var/log/mail.log.1'].freeze

    QUEUE_ID = '(?<queue_id>[0-9A-F]{8,})'
    CLEANUP_LINE = /postfix\/cleanup\[\d+\]: #{QUEUE_ID}: message-id=<(?<message_id>[^>]+)>/
    STATUS_LINE = /postfix\/[a-z]+\[\d+\]: #{QUEUE_ID}: to=<[^>]*>.*?status=(?<status>\w+) \((?<response>.*)\)/

    # Postfix называет статусы иначе, чем мы: у нас «доставлено», у него
    # «отправлено с точки зрения нашего сервера». Смысл тот же — принимающая
    # сторона подтвердила приём.
    STATUS_MAP = {
      'sent' => :delivered,
      'bounced' => :bounced,
      'deferred' => :deferred,
      'expired' => :bounced
    }.freeze

    def perform
      pending = EmailDelivery.where(status: %i[accepted deferred])
                             .where(created_at: 2.days.ago..)
                             .index_by(&:message_id)
      return if pending.empty?

      queue_ids, verdicts = scan_logs
      apply(pending, queue_ids, verdicts)
    end

    private

    # Возвращает две карты: идентификатор очереди → Message-ID и
    # идентификатор очереди → вердикт.
    def scan_logs
      queue_ids = {}
      verdicts = {}

      LOG_PATHS.each do |path|
        next unless File.readable?(path)

        File.foreach(path) do |line|
          if (match = CLEANUP_LINE.match(line))
            queue_ids[match[:queue_id]] = match[:message_id]
          elsif (match = STATUS_LINE.match(line))
            # Последняя строка по письму — самая свежая: после отложенной
            # доставки Postfix повторяет попытку и пишет новый статус.
            verdicts[match[:queue_id]] = { status: match[:status], response: match[:response] }
          end
        end
      end

      [queue_ids, verdicts]
    end

    def apply(pending, queue_ids, verdicts)
      queue_ids.each do |queue_id, message_id|
        record = pending[message_id]
        verdict = verdicts[queue_id]
        next if record.blank? || verdict.blank?

        status = STATUS_MAP[verdict[:status]]
        next if status.blank?

        record.update!(
          status: status,
          mta_queue_id: queue_id,
          mta_response: verdict[:response],
          delivered_at: status == :delivered ? Time.current : nil
        )
      end
    end
  end
end
