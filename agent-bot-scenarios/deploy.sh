#!/usr/bin/env bash
# Единая точка деплоя agent-bot-scenarios на дроплете (или локально).
# Запуск (на дроплете — от пользователя chatwoot):
#   sudo -u chatwoot bash agent-bot-scenarios/deploy.sh
# Идемпотентно: первый запуск делает `pm2 start`, последующие — `pm2 restart`.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

APP_NAME="slideedu-agent-bot"
PORT="${PORT:-8000}"

echo "==> git pull (текущая ветка репозитория)"
git -C .. pull --ff-only

echo "==> npm install"
npm install

if [ ! -f .env ]; then
  echo "!! .env не найден — скопируйте .env.example в .env и заполните перед запуском." >&2
  exit 1
fi

echo "==> pm2 ${APP_NAME}"
if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
    pm2 restart "$APP_NAME" --update-env
  else
    pm2 start src/server.js --name "$APP_NAME"
    pm2 save
  fi
else
  echo "!! pm2 не установлен: npm install -g pm2" >&2
  exit 1
fi

echo "==> health check (порт $PORT)"
sleep 1
if curl -fsS "http://localhost:${PORT}/health" >/dev/null; then
  echo "OK: бот отвечает на /health"
else
  echo "!! /health не отвечает — смотрите: pm2 logs ${APP_NAME}" >&2
  exit 1
fi
