# Справочник типов проблем. Список небольшой (десятки строк на метку),
# поэтому index отдаёт его целиком, а фильтрацию по главным меткам конкретной
# беседы делает фронтенд.
#
# Создавать новые типы может любой оператор — список наполняется прямо в
# процессе разбора обращений. От дублей защищает ProblemType.find_or_create_for:
# если такое название (с точностью до регистра, ё/е и пунктуации) уже есть,
# возвращается существующая запись.
#
# Переименование, удаление и объединение — только для администраторов
# (см. ProblemTypePolicy), со страницы «Настройки → Типы проблем».
class Api::V1::Accounts::ProblemTypesController < Api::V1::Accounts::BaseController
  before_action :check_authorization
  before_action :fetch_problem_type, only: [:update, :destroy, :merge]

  def index
    counts = Conversation.where(problem_type_id: Current.account.problem_types.select(:id)).group(:problem_type_id).count
    payload = Current.account.problem_types.order(:label_title, :name).map do |problem_type|
      problem_type.push_event_data.merge(conversations_count: counts.fetch(problem_type.id, 0))
    end
    render json: { payload: payload }
  end

  def create
    problem_type, created = ProblemType.find_or_create_for(
      account: Current.account,
      label_title: root_label_title,
      name: params.require(:name)
    )
    render json: { payload: problem_type.push_event_data, created: created }
  end

  # Дубль нового названия в той же метке отбивает валидация уникальности
  # normalized_name — администратор получит 422 с понятным текстом.
  def update
    if @problem_type.update(name: params.require(:name))
      render json: { payload: @problem_type.push_event_data }
    else
      render json: { error: I18n.t('problem_types.errors.duplicate') }, status: :unprocessable_entity
    end
  end

  # Удалить можно только тип, который нигде не выбран. Иначе его закрытые
  # беседы молча ушли бы в отчёте в «Не указано» — для таких есть merge.
  def destroy
    if @problem_type.conversations.exists?
      return render json: { error: I18n.t('problem_types.errors.in_use') }, status: :unprocessable_entity
    end

    @problem_type.destroy!
    head :ok
  end

  # Объединить с другим типом той же метки: беседы переходят на target,
  # исходный тип удаляется. update_all — намеренно, мимо валидаций беседы:
  # target той же главной метки, так что соответствие меткам не меняется,
  # а проверка «нельзя оставить закрытую без типа» здесь неприменима —
  # тип не пропадает, а заменяется.
  def merge
    target = Current.account.problem_types.find(params.require(:target_id))
    if target.id == @problem_type.id || target.label_title != @problem_type.label_title
      return render json: { error: I18n.t('problem_types.errors.merge_other_label') }, status: :unprocessable_entity
    end

    ActiveRecord::Base.transaction do
      @problem_type.conversations.update_all(problem_type_id: target.id, updated_at: Time.current)
      @problem_type.destroy!
    end
    render json: { payload: target.push_event_data }
  end

  private

  def fetch_problem_type
    @problem_type = Current.account.problem_types.find(params[:id])
  end

  # Тип создаётся только для существующей главной метки — иначе в справочнике
  # появились бы записи, которые нигде не показать.
  def root_label_title
    title = params.require(:label_title)
    root = ProblemTypes::RootLabels.root_of(title, Current.account.labels.pluck(:title))
    raise ActiveRecord::RecordNotFound, "Label #{title} not found" if root.nil?

    root
  end
end
