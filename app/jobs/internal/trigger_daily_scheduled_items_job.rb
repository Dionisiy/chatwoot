class Internal::TriggerDailyScheduledItemsJob < ApplicationJob
  queue_as :scheduled_jobs

  def perform
    # Schedule daily deferred jobs here so each installation can spread load
    # across the day without changing its slot on deploys or restarts.
    schedule_version_check
  end

  private

  # DISABLE_VERSION_CHECK отключает ежедневный поход в hub.2.chatwoot.com за
  # номером последней версии. Он нужен только для баннера "доступно обновление"
  # (см. UpdateBanner.vue и BuildInfo.vue: оба смотрят на latest_chatwoot_version,
  # который кладёт в Redis именно эта джоба). Мы обновляемся по своему процессу,
  # поэтому и баннер, и сам исходящий запрос не нужны.
  # Переменная в духе уже существующего DISABLE_TELEMETRY (см. lib/chatwoot_hub.rb).
  def schedule_version_check
    return unless Rails.env.production?
    return if ENV['DISABLE_VERSION_CHECK'].present?

    Internal::CheckNewVersionsJob.set(wait_until: version_check_run_at).perform_later
  end

  def version_check_run_at
    Time.current.utc.beginning_of_day + designated_minute.minutes
  end

  def designated_minute
    @designated_minute ||= Digest::MD5.hexdigest(ChatwootHub.installation_identifier).hex % 1440
  end
end

Internal::TriggerDailyScheduledItemsJob.prepend_mod_with('Internal::TriggerDailyScheduledItemsJob')
