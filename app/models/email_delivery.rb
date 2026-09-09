# == Schema Information
#
# Table name: email_deliveries
#
#  id              :bigint           not null, primary key
#  delivered_at    :datetime
#  error_message   :text
#  mailer          :string
#  message_id      :string           not null
#  mta_response    :text
#  status          :integer          default("pending"), not null
#  subject         :string
#  to_email        :string           not null
#  created_at      :datetime         not null
#  updated_at      :datetime         not null
#  account_id      :bigint           not null
#  conversation_id :bigint
#  mta_queue_id    :string
#
# Indexes
#
#  index_email_deliveries_on_account_id_and_created_at  (account_id,created_at)
#  index_email_deliveries_on_account_id_and_status      (account_id,status)
#  index_email_deliveries_on_message_id                 (message_id) UNIQUE
#  index_email_deliveries_on_mta_queue_id               (mta_queue_id)
#
# Одна строка — одно исходящее письмо, от попытки отправки до вердикта
# принимающего сервера. Заполняется автоматически (см. EmailDeliveryTracker),
# руками записи не создаются.
class EmailDelivery < ApplicationRecord
  belongs_to :account
  belongs_to :conversation, optional: true

  # Порядок статусов повторяет путь письма:
  #   pending   — запись создана, письмо ещё не отдано в MTA;
  #   accepted  — Postfix принял письмо в очередь;
  #   delivered — принимающий сервер подтвердил доставку (250 OK);
  #   bounced   — принимающий сервер отказал, причина в mta_response;
  #   deferred  — временный отказ, MTA продолжает попытки;
  #   failed    — письмо не удалось отдать даже в MTA, причина в error_message.
  #
  # pending — не «в процессе», а «зависшее»: между созданием записи и ответом
  # MTA проходят миллисекунды, поэтому строка, застрявшая в pending, означает
  # прерванную отправку. Именно так выглядели бы потерянные письма из-за
  # ошибки в мейлере, которые раньше исчезали бесследно.
  enum :status, {
    pending: 0,
    accepted: 1,
    delivered: 2,
    bounced: 3,
    deferred: 4,
    failed: 5
  }

  validates :message_id, presence: true, uniqueness: true
  validates :to_email, presence: true

  scope :latest_first, -> { order(created_at: :desc) }
  # Статусы, при которых письмо до адресата не дошло и, скорее всего, уже не
  # дойдёт — то, что имеет смысл показывать отдельным фильтром и переотправлять.
  scope :problematic, -> { where(status: %i[pending bounced failed]) }

  # Ждёт ли письмо ещё окончательного вердикта от MTA. По таким записям
  # Emails::SyncDeliveryStatusJob и ищет строки в логе Postfix.
  def awaiting_mta_verdict?
    accepted? || deferred?
  end
end
