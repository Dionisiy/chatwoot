# Дефолты для ограничения видимости диалогов по меткам (см.
# Conversations::LabelAccessFilterService) — nil означает "ещё не трогали
# в настройках", ведём себя как явно заданное значение по умолчанию, а не
# как "фича выключена".
module AccountLabelAccess
  extend ActiveSupport::Concern

  def label_access_match_mode
    super || 'any'
  end

  # store_accessor only generates the bang-less `label_access_show_unlabeled`
  # getter (matching the settings key), so `super` here overrides that one;
  # `label_access_show_unlabeled?` is a separate method with no store_accessor
  # counterpart to call `super` on.
  def label_access_show_unlabeled
    value = super
    value.nil? ? true : value
  end

  def label_access_show_unlabeled?
    ActiveModel::Type::Boolean.new.cast(label_access_show_unlabeled)
  end
end
