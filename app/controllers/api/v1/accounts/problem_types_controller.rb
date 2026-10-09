# Справочник типов проблем. Список небольшой (десятки строк на метку),
# поэтому index отдаёт его целиком, а фильтрацию по главным меткам конкретной
# беседы делает фронтенд.
#
# Создавать новые типы может любой оператор — список наполняется прямо в
# процессе разбора обращений. От дублей защищает ProblemType.find_or_create_for:
# если такое название (с точностью до регистра, ё/е и пунктуации) уже есть,
# возвращается существующая запись.
class Api::V1::Accounts::ProblemTypesController < Api::V1::Accounts::BaseController
  def index
    render json: { payload: Current.account.problem_types.order(:label_title, :name).map(&:push_event_data) }
  end

  def create
    problem_type, created = ProblemType.find_or_create_for(
      account: Current.account,
      label_title: root_label_title,
      name: params.require(:name)
    )
    render json: { payload: problem_type.push_event_data, created: created }
  end

  private

  # Тип создаётся только для существующей главной метки — иначе в справочнике
  # появились бы записи, которые нигде не показать.
  def root_label_title
    title = params.require(:label_title)
    root = ProblemTypes::RootLabels.root_of(title, Current.account.labels.pluck(:title))
    raise ActiveRecord::RecordNotFound, "Label #{title} not found" if root.nil?

    root
  end
end
