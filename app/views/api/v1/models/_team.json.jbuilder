json.id resource.id
json.name resource.name
json.description resource.description
json.allow_auto_assign resource.allow_auto_assign
json.icon resource.icon
json.icon_color resource.icon_color
json.account_id resource.account_id

# Current.user не всегда реальный Agent/User — например, при запросе конкретной
# заявки токеном агент-бота (наш agent-bot-scenarios, см.
# chatwootClient.js#getConversationCategory) Current.user это AgentBot, у
# которого нет ассоциации teams вовсе. Раньше это падало 500-й ошибкой
# (undefined method 'teams' for an instance of AgentBot) на любой заявке с
# назначенной командой — из-за чего бот не мог определить категорию диалога
# и вместо нужной ветки сценария всегда откатывался на main_menu.
json.is_member Current.user.respond_to?(:teams) && Current.user.teams.include?(resource)
