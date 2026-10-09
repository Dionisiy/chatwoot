# Справочник типов проблем пополняют все операторы — прямо из беседы.
# Чистить его (переименовывать, удалять, объединять) могут только
# администраторы: эти действия меняют уже собранную статистику.
class ProblemTypePolicy < ApplicationPolicy
  def index?
    true
  end

  def create?
    true
  end

  def update?
    @account_user.administrator?
  end

  def destroy?
    @account_user.administrator?
  end

  def merge?
    @account_user.administrator?
  end
end
