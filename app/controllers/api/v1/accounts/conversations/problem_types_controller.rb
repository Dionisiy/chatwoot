# Выбрать тип проблемы беседы (problem_type_id) или сбросить (пустое значение).
# Соответствие типа главным меткам беседы проверяет валидация модели
# (Conversation#problem_type_matches_labels).
class Api::V1::Accounts::Conversations::ProblemTypesController < Api::V1::Accounts::Conversations::BaseController
  def create
    @conversation.update!(problem_type_id: params[:problem_type_id].presence)
    render json: { problem_type: @conversation.problem_type&.push_event_data }
  end
end
