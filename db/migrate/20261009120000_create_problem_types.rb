class CreateProblemTypes < ActiveRecord::Migration[7.1]
  def change
    # Справочник «типов проблем» — подкатегорий обращения внутри главной метки
    # (bumes, logo-chat, finance, tech-support, slideedu). По смыслу похож на
    # приоритет: одно значение на беседу, выставляет оператор. Но набор
    # вариантов свой у каждой метки и пополняется прямо в процессе работы —
    # оператор не нашёл подходящую проблему в списке и создал новую.
    create_table :problem_types do |t|
      t.references :account, null: false
      # Название главной метки, к которой относится тип. Строкой, а не id
      # Label: беседа хранит свои метки именно названиями (acts_as_taggable),
      # и сопоставление идёт по ним.
      t.string :label_title, null: false
      t.string :name, null: false
      # Название, приведённое к виду для сравнения (регистр, ё/е, пунктуация,
      # пробелы — см. ProblemType.normalize). Уникальный индекс по нему не даёт
      # завести «Не работает чат» и «не работает  чат!» как две разные проблемы,
      # даже если два оператора создают их одновременно.
      t.string :normalized_name, null: false
      t.timestamps
    end

    add_index :problem_types, [:account_id, :label_title, :normalized_name], unique: true,
                                                                             name: 'index_problem_types_uniqueness'

    add_reference :conversations, :problem_type, null: true, index: true
  end
end
