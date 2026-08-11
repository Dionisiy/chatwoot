# Отключает автоматический ежедневный сброс премиум-фич (Captain, SLA,
# Custom Roles и т.д.) на self-hosted инсталляциях без активной лицензии.
#
# По умолчанию Internal::ReconcilePlanConfigService#reconcile_premium_features
# (enterprise/app/services/internal/reconcile_plan_config_service.rb) вызывается
# ежедневно из Internal::CheckNewVersionsJob и откатывает все флаги из
# enterprise/config/premium_features.yml, если ChatwootHub.pricing_plan == 'community'.
#
# Это временный оверрайд для тестового контура поддержки (оценка функционала
# перед решением "покупка лицензии" vs "ремейк на другом стеке"). Убрать этот
# файл, если решите оплатить Enterprise-лицензию — тогда реконсиляция снова
# будет корректно синхронизировать реальный оплаченный план.
Rails.application.config.to_prepare do
  Internal::ReconcilePlanConfigService.class_eval do
    def reconcile_premium_features
      # no-op: намеренно отключено, см. комментарий в начале файла
    end
  end
end
