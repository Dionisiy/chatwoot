class Api::V1::Accounts::EmailDeliveriesController < Api::V1::Accounts::BaseController
  before_action :check_authorization
  before_action :fetch_delivery, only: [:resend]

  RESULTS_PER_PAGE = 25

  def index
    @deliveries = Current.account.email_deliveries.latest_first
    @deliveries = @deliveries.where(status: params[:status]) if params[:status].present?
    @deliveries = @deliveries.where(conversation_id: params[:conversation_id]) if params[:conversation_id].present?
    @total_count = @deliveries.count
    @deliveries = @deliveries.page(params[:page] || 1).per(RESULTS_PER_PAGE)
  end

  # Повторная отправка возможна только для писем по диалогу: тело письма мы не
  # храним, оно собирается мейлером заново из самого диалога. Для писем без
  # диалога (уведомления агентам, сброс пароля) восстанавливать нечего.
  def resend
    conversation = @delivery.conversation
    if conversation.blank?
      return render json: { error: I18n.t('email_deliveries.resend.no_conversation') }, status: :unprocessable_entity
    end

    message_id = @delivery.message_id[%r{/messages/(\d+)@}, 1]
    if message_id.blank?
      return render json: { error: I18n.t('email_deliveries.resend.unsupported') }, status: :unprocessable_entity
    end

    ConversationReplyMailer.with(account: Current.account)
                           .reply_with_summary(conversation, message_id.to_i)
                           .deliver_later
    head :ok
  end

  private

  def fetch_delivery
    @delivery = Current.account.email_deliveries.find(params[:id])
  end
end
