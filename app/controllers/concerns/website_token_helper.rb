module WebsiteTokenHelper
  def auth_token_params
    @auth_token_params ||= ::Widget::TokenService.new(token: request.headers['X-Auth-Token']).decode_token
  end

  def set_web_widget
    @web_widget = ::Channel::WebWidget.find_by!(website_token: permitted_params[:website_token])
    @current_account = @web_widget.inbox.account

    render json: { error: 'Account is suspended' }, status: :unauthorized unless @current_account.active?
  end

  def set_contact
    @contact_inbox = @web_widget.inbox.contact_inboxes.find_by(
      source_id: auth_token_params[:source_id]
    )
    @contact_inbox ||= restore_contact_inbox
    @contact = @contact_inbox&.contact
    raise ActiveRecord::RecordNotFound unless @contact

    Current.contact = @contact
  end

  # Токен виджета живёт в браузере посетителя до года, а contact_inbox, на
  # который он ссылается, может исчезнуть — например, после чистки тестовых
  # контактов или переноса инсталляции на другой сервер. Апстрим в этом случае
  # отвечает 404 на КАЖДЫЙ запрос виджета, и посетитель залипает намертво:
  # чат не открывается, пока он сам не очистит хранилище сайта. Мы вместо
  # этого поднимаем сессию заново под тем же source_id.
  #
  # Подделать сюда ничего нельзя: source_id берётся только из токена, а токен
  # подписан нашим SECRET_KEY_BASE — не расшифровался, значит source_id пустой
  # и мы просто уходим в тот же 404, что и раньше. Данных старого контакта
  # такой посетитель тоже не получит: его уже нет, создаётся чистый анонимный,
  # а личность к нему привяжет обычный setUser с проверкой HMAC.
  def restore_contact_inbox
    source_id = auth_token_params[:source_id]
    return if source_id.blank?

    ::ContactInboxWithContactBuilder.new(
      inbox: @web_widget.inbox,
      source_id: source_id,
      contact_attributes: {}
    ).perform
  end

  def permitted_params
    params.permit(:website_token)
  end
end
