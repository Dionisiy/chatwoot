class ConversationPolicy < ApplicationPolicy
  def index?
    true
  end

  def destroy?
    administrator?
  end

  def show?
    administrator? || agent_bot? || (agent_can_view_conversation? && label_access?)
  end

  private

  def agent_can_view_conversation?
    inbox_access? || team_access?
  end

  # Дополнительный, независимый слой — та же логика (OR/AND, видимость
  # немаркированных), что и в списках диалогов, см.
  # Conversations::LabelAccessFilterService. Переиспользуем сервис вместо
  # дублирования условий, чтобы поведение прямого доступа к диалогу (show)
  # и списков (index/list) не расходилось.
  def label_access?
    return true if account.blank?

    Conversations::LabelAccessFilterService.new(
      Conversation.where(id: record.id), user: user, account: account
    ).perform.exists?
  end

  def administrator?
    account_user&.administrator?
  end

  def agent_bot?
    user.is_a?(AgentBot)
  end

  def inbox_access?
    user.inboxes.where(account_id: account&.id).exists?(id: record.inbox_id)
  end

  def team_access?
    return false if record.team_id.blank?

    user.teams.where(account_id: account&.id).exists?(id: record.team_id)
  end

  def assigned_to_user?
    record.assignee_id == user.id
  end

  def participant?
    record.conversation_participants.exists?(user_id: user.id)
  end
end

ConversationPolicy.prepend_mod_with('ConversationPolicy')
