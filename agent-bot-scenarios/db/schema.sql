-- Хранилище дерева сценария бота (flows.json раньше жил на диске, теперь —
-- здесь, в той же Postgres, что и сам Chatwoot: отдельная база под один
-- маленький Node-сервис — overkill, а общая уже поднята и бэкапится).
--
-- Дизайн сознательно однотабличный: КАЖДОЕ сохранение из /admin — это НОВАЯ
-- строка (append-only), "текущая" версия — просто строка с максимальным id.
-- Так история версий получается бесплатно, без отдельной таблицы и без
-- дублирования данных между "текущим" и "архивным" состоянием. "Откат" к
-- старой версии (POST /admin/api/flows/history/:id/restore) — это ЕЩЁ одна
-- INSERT со старым content, а не UPDATE/DELETE: история никогда не теряется,
-- даже после отката к старой версии видно, что и когда произошло.
--
-- Применение (на дропле, там же где Rails БД):
--   PGPASSWORD=... psql -h localhost -U chatwoot -d chatwoot_production -f db/schema.sql
-- Безопасно перезапускать (IF NOT EXISTS) — так и задумано, отдельного
-- механизма миграций под одну таблицу заводить не стали.
CREATE TABLE IF NOT EXISTS agent_bot_flow_versions (
  id BIGSERIAL PRIMARY KEY,
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_bot_flow_versions_created_at
  ON agent_bot_flow_versions (created_at DESC);
