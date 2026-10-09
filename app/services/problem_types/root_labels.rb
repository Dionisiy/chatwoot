# Главные метки беседы — те, к которым привязаны списки типов проблем.
#
# Метка считается подметкой, если её название начинается с названия другой
# существующей метки и дефиса: finance-payment → finance. Остальные — главные:
# logo-chat и tech-support остаются собой, потому что меток logo и tech нет.
# Так список главных меток не нужно вести вручную: заведёт админ новую
# метку finance-refund — она автоматически унаследует список finance.
#
# Та же логика продублирована во фронтенде (dashboard/helper/problemTypes.js) —
# при правке менять оба места.
class ProblemTypes::RootLabels
  def self.for(account, titles)
    all_titles = account.labels.pluck(:title)
    Array(titles).filter_map { |title| root_of(title, all_titles) }.uniq
  end

  def self.root_of(title, all_titles)
    all_titles.select { |candidate| title == candidate || title.start_with?("#{candidate}-") }
              .min_by(&:length)
  end
end
