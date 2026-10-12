// Главные метки беседы и сравнение названий типов проблем.
//
// Логика зеркалит бэкенд — ProblemTypes::RootLabels и ProblemType.normalize.
// При правке менять оба места.

// Метка — подметка, если её название начинается с названия другой
// существующей метки и дефиса: finance-payment → finance.
export const rootLabelOf = (title, allTitles) =>
  allTitles
    .filter(
      candidate => title === candidate || title.startsWith(`${candidate}-`)
    )
    .sort((a, b) => a.length - b.length)[0] || null;

// Главные метки без типов проблем: у финансов классификацию дают подметки
// finance-*, тип там не выбирается и не требуется — беседа считается
// «Не определено». Зеркалит ProblemTypes::RootLabels::EXEMPT на бэкенде.
export const EXEMPT_ROOT_LABELS = ['finance'];

const allRootLabelsOf = (titles = [], allTitles = []) => [
  ...new Set(
    titles.map(title => rootLabelOf(title, allTitles)).filter(Boolean)
  ),
];

// Главные метки беседы, для которых выбирается тип проблемы.
export const rootLabelsOf = (titles = [], allTitles = []) =>
  allRootLabelsOf(titles, allTitles).filter(
    root => !EXEMPT_ROOT_LABELS.includes(root)
  );

// Беседа только с метками без типов (например, только finance-*): поле
// показываем, но с фиксированным «Не определено» вместо выбора.
export const hasOnlyExemptRoots = (titles = [], allTitles = []) => {
  const roots = allRootLabelsOf(titles, allTitles);
  return (
    roots.length > 0 && roots.every(root => EXEMPT_ROOT_LABELS.includes(root))
  );
};

// Нужно ли выбрать тип проблемы перед закрытием оператором: тип не выбран,
// а у беседы есть главная метка (иначе выбирать не из чего). Зеркалит
// Conversation#problem_type_required_for_agent_resolve на бэкенде.
export const needsProblemType = (conversation, labels, allTitles) =>
  !conversation?.problem_type && rootLabelsOf(labels, allTitles).length > 0;

export const normalizeProblemName = name =>
  (name || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Подходит ли существующий тип под введённый текст: подстрока целиком или
// общее «значимое» слово (от 4 букв). Второе нужно, чтобы на «чат не
// работает» оператор увидел уже существующее «Не работает чат» и не завёл
// дубль с переставленными словами.
export const matchesProblemQuery = (name, query) => {
  const target = normalizeProblemName(name);
  const needle = normalizeProblemName(query);
  if (!needle) return true;
  if (target.includes(needle)) return true;

  const words = needle.split(' ').filter(word => word.length >= 4);
  return words.some(word => target.includes(word));
};
