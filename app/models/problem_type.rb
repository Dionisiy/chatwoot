# == Schema Information
#
# Table name: problem_types
#
#  id              :bigint           not null, primary key
#  label_title     :string           not null
#  name            :string           not null
#  normalized_name :string           not null
#  created_at      :datetime         not null
#  updated_at      :datetime         not null
#  account_id      :bigint           not null
#
# Indexes
#
#  index_problem_types_on_account_id  (account_id)
#  index_problem_types_uniqueness     (account_id,label_title,normalized_name) UNIQUE
#
class ProblemType < ApplicationRecord
  belongs_to :account
  has_many :conversations, dependent: :nullify

  before_validation :assign_normalized_name

  validates :label_title, presence: true
  validates :name, presence: true, length: { maximum: 100 }
  validates :normalized_name, presence: true, uniqueness: { scope: [:account_id, :label_title] }

  # Ключ сравнения для защиты от дублей: регистр, ё/е, пунктуация и лишние
  # пробелы не делают проблему новой.
  def self.normalize(name)
    name.to_s.unicode_normalize(:nfkc).downcase.tr('ё', 'е').gsub(/[\p{P}\p{S}]+/, ' ').squish
  end

  # Найти существующий тип с тем же нормализованным названием или создать.
  # Возвращает [тип, создан_ли_сейчас]. При гонке двух одновременных создателей
  # уникальный индекс отбивает второй INSERT — тогда отдаём запись первого.
  def self.find_or_create_for(account:, label_title:, name:)
    scope = account.problem_types.where(label_title: label_title)
    existing = scope.find_by(normalized_name: normalize(name))
    return [existing, false] if existing

    [scope.create!(name: name.to_s.squish), true]
  rescue ActiveRecord::RecordNotUnique
    [scope.find_by!(normalized_name: normalize(name)), false]
  end

  def push_event_data
    { id: id, name: name, label_title: label_title }
  end

  private

  def assign_normalized_name
    self.name = name.to_s.squish
    self.normalized_name = self.class.normalize(name)
  end
end
