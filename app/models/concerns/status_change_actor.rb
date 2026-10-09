module StatusChangeActor
  private

  # Кто сменил статус — структурированно, а не только текстом сообщения.
  # Нужно для персональной статистики «кто сколько закрыл»: штатный
  # ReportingEvent пишет в user_id назначенного оператора (assignee), а не
  # того, кто нажал «Решить», — у SlideEdu бот назначает команду, и
  # назначенного человека у большинства бесед нет вовсе.
  def status_change_actor
    actor = Current.executed_by.presence || Current.user || Current.contact
    return { actor_type: 'System' } if actor.nil?

    { actor_type: actor.class.name, actor_id: actor.id }
  end
end
