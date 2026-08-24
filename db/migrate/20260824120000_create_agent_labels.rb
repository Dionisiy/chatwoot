class CreateAgentLabels < ActiveRecord::Migration[7.1]
  def change
    # Ограничение видимости диалогов агенту по меткам (см.
    # Conversations::LabelAccessFilterService) — дополнительный слой поверх
    # существующего ограничения по инбоксам (InboxMember), не замена ему.
    # Отсутствие записей для агента = ограничения не настроены, поведение
    # не меняется (агент видит всё, что видел раньше).
    create_table :agent_labels do |t|
      t.references :account, null: false
      t.references :user, null: false
      t.references :label, null: false

      t.timestamps
    end

    add_index :agent_labels, [:user_id, :label_id], unique: true, name: 'idx_agent_labels_unique_user_label'
  end
end
