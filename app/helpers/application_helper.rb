module ApplicationHelper
  # Список языков для выбора в интерфейсе (Profile Settings и виджет).
  #
  # ENABLED_LOCALES позволяет сузить его до тех языков, переводы которых
  # реально собраны во фронтенд-бандл (см. app/javascript/dashboard/i18n/index.js:
  # там оставлены только en/ru/uk, потому что все 57 локалей апстрима весили
  # 8 МБ из 12 МБ главного чанка дашборда). Без этой фильтрации пользователь
  # мог бы выбрать язык, которого в бандле нет, и получить интерфейс на фолбэке.
  #
  # Переменная не задана — поведение апстрима, отдаём все языки.
  def available_locales_with_name
    locales = LANGUAGES_CONFIG.map { |_key, val| val.slice(:name, :iso_639_1_code) }
    enabled = ENV.fetch('ENABLED_LOCALES', '').split(',').map(&:strip).reject(&:blank?)
    return locales if enabled.blank?

    locales.select { |locale| enabled.include?(locale[:iso_639_1_code]) }
  end

  def feature_help_urls
    features = YAML.safe_load(Rails.root.join('config/features.yml').read).freeze
    features.each_with_object({}) do |feature, hash|
      hash[feature['name']] = feature['help_url'] if feature['help_url']
    end
  end
end
