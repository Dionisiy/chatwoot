# Журнал писем виден только администраторам: в нём адреса и темы писем по
# всем диалогам аккаунта разом, в том числе по тем, доступ к которым агенту
# закрыт ограничением по меткам (см. Conversations::LabelAccessFilterService).
class EmailDeliveryPolicy < ApplicationPolicy
  def index?
    @account_user.administrator?
  end

  def resend?
    @account_user.administrator?
  end
end
