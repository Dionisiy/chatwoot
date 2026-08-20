#!/usr/bin/env bash
# Единая точка деплоя backend-части Chatwoot (Rails + Vite-виджет) на дроплете.
#
# Запуск (на дроплете, от root — так же, как и весь остальной деплой этого
# проекта запускается в реальности):
#   bash deploy.sh
#
# ВАЖНО: этот скрипт НЕ синхронизирует git сам. Ветка на дропле (custom/slideedu-stage)
# реально расходится с origin на десятки локальных коммитов — `git reset --hard`
# их бы снёс. Синхронизацию делает вызывающий вручную, до запуска этого скрипта
# (см. agent-bot-scenarios/deploy.sh — та же причина и тот же принцип там).
#
# Что делает:
#   1. bundle install (если Gemfile.lock менялся)
#   2. assets:clobber, ЗАТЕМ assets:precompile — именно в этом порядке.
#      Без clobber прекомпиляция иногда молча не пересобирает часть чанков
#      (например виджет-бандл), и на сайте остаётся старая версия при том что
#      команда отрабатывает без ошибок.
#   3. рестарт chatwoot-web.1.service / chatwoot-worker.1.service
#   4. health-check по локальному порту
#
# Bot-сервис (agent-bot-scenarios, отдельный Node-процесс под pm2) этот скрипт
# НЕ трогает — для него используйте agent-bot-scenarios/deploy.sh отдельно.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

export RAILS_ENV=production
# Дефолтный V8-хип на этом дроплете (4GB RAM + 8GB swap) упирается в потолок
# около 2GB при сборке Vite и падает "JavaScript heap out of memory" — явно
# поднимаем лимит, памяти реально хватает (see: free -h).
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"

if command -v rbenv >/dev/null 2>&1; then
  eval "$(rbenv init -)"
fi

echo "==> bundle install"
bundle check >/dev/null 2>&1 || bundle install

echo "==> assets:clobber"
bundle exec rails assets:clobber

echo "==> assets:precompile"
bundle exec rails assets:precompile

echo "==> restart chatwoot-web / chatwoot-worker"
sudo systemctl restart chatwoot-web.1.service chatwoot-worker.1.service

echo "==> health check"
sleep 2
if curl -fsS "http://localhost:3000/" >/dev/null; then
  echo "OK: backend отвечает"
else
  echo "!! backend не отвечает после рестарта — смотрите: sudo journalctl -u chatwoot-web.1.service -n 50" >&2
  exit 1
fi
