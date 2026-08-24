# Дефолты для ограничения видимости диалогов по меткам (см.
# Conversations::LabelAccessFilterService) — nil означает "ещё не трогали
# в настройках", ведём себя как явно заданное значение по умолчанию, а не
# как "фича выключена".
module AccountLabelAccess
  extend ActiveSupport::Concern

  def label_access_match_mode
    super || 'any'
  end

  def label_access_show_unlabeled?
    value = super
    value.nil? || ActiveModel::Type::Boolean.new.cast(value)
  end
end
