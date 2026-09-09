# Журнал исходящих писем (см. Emails::DeliveryTracker и модель EmailDelivery).
#
# Подключаемся штатными хуками ActionMailer, а не правкой мейлеров: писем в
# Chatwoot десятки, и любой новый мейлер попадёт в журнал автоматически.
#
# В тестах не регистрируем: там письма никуда не уходят, а лишние записи в
# базе только мешают проверкам.
Rails.application.config.to_prepare do
  next if Rails.env.test?

  ActionMailer::Base.register_interceptor(
    Class.new do
      def self.delivering_email(message)
        Emails::DeliveryTracker.before_delivery(message)
      end
    end
  )

  ActionMailer::Base.register_observer(
    Class.new do
      def self.delivered_email(message)
        Emails::DeliveryTracker.after_delivery(message)
      end
    end
  )
end
