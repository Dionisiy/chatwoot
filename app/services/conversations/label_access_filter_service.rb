# Доп. слой видимости диалогов по меткам, независимый от инбоксов/команд/
# custom role permissions — применяется поверх любого из них (см.
# Conversations::PermissionFilterService#apply_label_restriction). У агента
# без единой настроенной записи в AgentLabel ограничение не активно: метод
# возвращает переданную область видимости без изменений — то есть по
# умолчанию для всех уже работающих агентов ничего не меняется, фича сугубо
# opt-in через Settings → Agents.
class Conversations::LabelAccessFilterService
  def initialize(conversations, user:, account:)
    @conversations = conversations
    @user = user
    @account = account
  end

  def perform
    return @conversations if allowed_titles.empty?

    matched_ids = match_all? ? without_forbidden_labels_ids : with_any_allowed_label_ids
    matched_ids = show_unlabeled? ? (matched_ids | unlabeled_ids) : (matched_ids - unlabeled_ids)
    @conversations.where(id: matched_ids)
  end

  private

  def allowed_titles
    @allowed_titles ||= @user.restricted_labels.where(account_id: @account.id).pluck(:title)
  end

  def match_all?
    @account.label_access_match_mode == 'all'
  end

  def show_unlabeled?
    @account.label_access_show_unlabeled?
  end

  def with_any_allowed_label_ids
    @conversations.tagged_with(allowed_titles, any: true).pluck(:id)
  end

  # "Все метки диалога разрешены агенту" эквивалентно "у диалога нет ни
  # одной метки вне разрешённого набора" — считаем через дополнение
  # (запрещённые = все метки аккаунта минус разрешённые), а не через
  # проверку подмножества, т.к. tagged_with заточен под "есть хотя бы одна".
  # Немаркированные диалоги проходят этот шаг всегда (у них нет запрещённых
  # меток по построению) — видимость для них отдельно решает show_unlabeled?
  # в perform.
  def without_forbidden_labels_ids
    forbidden_titles = @account.labels.where.not(title: allowed_titles).pluck(:title)
    return @conversations.pluck(:id) if forbidden_titles.empty?

    @conversations.where.not(id: @conversations.tagged_with(forbidden_titles, any: true).select(:id)).pluck(:id)
  end

  def unlabeled_ids
    @conversations.where.missing(:taggings).pluck(:id)
  end
end
