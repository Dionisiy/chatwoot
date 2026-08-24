# == Schema Information
#
# Table name: agent_labels
#
#  id         :bigint           not null, primary key
#  created_at :datetime         not null
#  updated_at :datetime         not null
#  account_id :bigint           not null
#  label_id   :bigint           not null
#  user_id    :bigint           not null
#
# Indexes
#
#  idx_agent_labels_unique_user_label  (user_id,label_id) UNIQUE
#  index_agent_labels_on_account_id    (account_id)
#  index_agent_labels_on_label_id      (label_id)
#  index_agent_labels_on_user_id       (user_id)
#
# Ограничивает, какие диалоги видит агент, до тех, что помечены разрешёнными
# ему метками (см. Conversations::LabelAccessFilterService). Отсутствие
# записей для пары (account, user) означает, что ограничение не настроено —
# агент видит всё, что видел бы без этой фичи (инбоксы/команды как раньше).
class AgentLabel < ApplicationRecord
  belongs_to :account
  belongs_to :user
  belongs_to :label

  validates :label_id, uniqueness: { scope: :user_id }
end
