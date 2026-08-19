class Api::V1::Widget::ConversationsController < Api::V1::Widget::BaseController
  include Events::Types
  before_action :render_not_found_if_empty, only: [:toggle_typing, :toggle_status, :set_custom_attributes, :destroy_custom_attributes]

  def index
    @conversation = conversation
  end

  # Список всех тикетов контакта (для экрана "Мои заявки" в виджете) —
  # в отличие от index/conversation (conversations.last), отдаёт все
  # диалоги контакта, а не только последний. См. base_controller#conversations.
  #
  # last_message/unread_count раньше считались по одному запросу на
  # каждую заявку в jbuilder (N+1, заметно тормозило при большом числе
  # тикетов) — здесь оба значения собираются двумя батч-запросами и
  # передаются в jbuilder уже готовыми хэшами conversation_id => значение.
  def list
    @conversations = conversations.order(last_activity_at: :desc)
    conversation_ids = @conversations.map(&:id)

    # Message задаёт default_scope { order(created_at: :asc) } — обычный
    # .order(...) добавляется после него, и итоговый ORDER BY не начинается
    # с conversation_id, из-за чего Postgres падает на DISTINCT ON
    # ("expressions must match initial ORDER BY expressions"). .reorder
    # полностью заменяет сортировку, а не дополняет её.
    @last_messages_by_conversation = Message.chat
                                             .where(conversation_id: conversation_ids)
                                             .reorder(:conversation_id, created_at: :desc)
                                             .select('DISTINCT ON (conversation_id) conversation_id, content')
                                             .index_by(&:conversation_id)

    # to_timestamp(0) отдаёт timestamptz, а contact_last_seen_at — timestamp
    # without time zone (t.datetime без явного timestamptz в схеме); COALESCE
    # смешанных типов падает в Postgres ("cannot be matched"), поэтому
    # заглушка передаётся биндом, а не голым SQL-выражением.
    @unread_counts_by_conversation = Message.chat.outgoing
                                             .joins(:conversation)
                                             .where(conversation_id: conversation_ids)
                                             .where('messages.created_at > COALESCE(conversations.contact_last_seen_at, ?)', Time.zone.at(0))
                                             .group(:conversation_id)
                                             .count
  end

  def create
    ActiveRecord::Base.transaction do
      process_update_contact
      @conversation = create_conversation
      conversation.messages.create!(message_params)
      # TODO: Temporary fix for message type cast issue, since message_type is returning as string instead of integer
      conversation.reload
    end
  end

  def process_update_contact
    @contact = ContactIdentifyAction.new(
      contact: @contact,
      params: { email: contact_email, phone_number: contact_phone_number, name: contact_name, custom_attributes: contact_custom_attributes },
      retain_original_contact_name: true,
      discard_invalid_attrs: true
    ).perform
  end

  def update_last_seen
    head :ok && return if conversation.nil?

    conversation.contact_last_seen_at = DateTime.now.utc
    conversation.save!
    ::Conversations::UpdateMessageStatusJob.perform_later(conversation.id, conversation.contact_last_seen_at)
    head :ok
  end

  def transcript
    return head :too_many_requests if conversation.blank?
    return head :payment_required unless conversation.account.email_transcript_enabled?
    return head :too_many_requests unless conversation.account.within_email_rate_limit?

    send_transcript_email
    head :ok
  end

  def toggle_typing
    case permitted_params[:typing_status]
    when 'on'
      trigger_typing_event(CONVERSATION_TYPING_ON)
    when 'off'
      trigger_typing_event(CONVERSATION_TYPING_OFF)
    end

    head :ok
  end

  def toggle_status
    return head :forbidden unless @web_widget.end_conversation?

    unless conversation.resolved?
      conversation.status = :resolved
      conversation.save!
    end
    head :ok
  end

  def set_custom_attributes
    conversation.update!(custom_attributes: permitted_params[:custom_attributes])
  end

  def destroy_custom_attributes
    conversation.custom_attributes = conversation.custom_attributes.excluding(params[:custom_attribute])
    conversation.save!
    render json: conversation
  end

  private

  def send_transcript_email
    return if conversation.contact&.email.blank?

    ConversationReplyMailer.with(account: conversation.account).conversation_transcript(
      conversation,
      conversation.contact.email
    )&.deliver_later
    conversation.account.increment_email_sent_count
  end

  def trigger_typing_event(event)
    Rails.configuration.dispatcher.dispatch(event, Time.zone.now, conversation: conversation, user: @contact)
  end

  def render_not_found_if_empty
    return head :not_found if conversation.nil?
  end

  def permitted_params
    params.permit(:id, :typing_status, :website_token, :email, contact: [:name, :email, :phone_number, { custom_attributes: {} }],
                                                               message: [:content, :referer_url, :timestamp, :echo_id],
                                                               custom_attributes: {})
  end
end
