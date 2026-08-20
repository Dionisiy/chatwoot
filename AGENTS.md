# Chatwoot Development Guidelines

## Build / Test / Lint

- **Setup**: `bundle install && pnpm install`
- **Run Dev**: `pnpm dev` or `overmind start -f ./Procfile.dev`
- **Seed Local Test Data**: `bundle exec rails db:seed` (quickly populates minimal data for standard feature verification)
- **Seed Search Test Data**: `bundle exec rails search:setup_test_data` (bulk fixture generation for search/performance/manual load scenarios)
- **Seed Account Sample Data (richer test data)**: `Seeders::AccountSeeder` is available as an internal utility and is exposed through Super Admin `Accounts#seed`, but can be used directly in dev workflows too:
  - UI path: Super Admin → Accounts → Seed (enqueues `Internal::SeedAccountJob`).
  - CLI path: `bundle exec rails runner "Internal::SeedAccountJob.perform_now(Account.find(<id>))"` (or call `Seeders::AccountSeeder.new(account: Account.find(<id>)).perform!` directly).
- **Lint JS/Vue**: `pnpm eslint` / `pnpm eslint:fix`
- **Lint Ruby**: `bundle exec rubocop -a`
- **Test JS**: `pnpm test` or `pnpm test:watch`
- **Test Ruby**: `bundle exec rspec spec/path/to/file_spec.rb`
- **Single Test**: `bundle exec rspec spec/path/to/file_spec.rb:LINE_NUMBER`
- **Run Project**: `overmind start -f Procfile.dev`
- **Ruby Version**: Manage Ruby via `rbenv` and install the version listed in `.ruby-version` (e.g., `rbenv install $(cat .ruby-version)`)
- **rbenv setup**: Before running any `bundle` or `rspec` commands, init rbenv in your shell (`eval "$(rbenv init -)"`) so the correct Ruby/Bundler versions are used
- Always prefer `bundle exec` for Ruby CLI tasks (rspec, rake, rubocop, etc.)

## Code Style

- **Ruby**: Follow RuboCop rules (150 character max line length)
- **Vue/JS**: Use ESLint (Airbnb base + Vue 3 recommended)
- **Vue Components**: Use PascalCase
- **Events**: Use camelCase
- **I18n**: No bare strings in templates; use i18n
- **Error Handling**: Use custom exceptions (`lib/custom_exceptions/`)
- **Models**: Validate presence/uniqueness, add proper indexes
- **Type Safety**: Use PropTypes in Vue, strong params in Rails
- **Naming**: Use clear, descriptive names with consistent casing
- **Vue API**: Always use Composition API with `<script setup>` at the top

## Styling

- **Tailwind Only**:  
  - Do not write custom CSS  
  - Do not use scoped CSS  
  - Do not use inline styles  
  - Always use Tailwind utility classes  
- **Colors**: Refer to `tailwind.config.js` for color definitions

## General Guidelines

- Prefer the smallest production-ready change that solves the current problem.
- Build for the expected production path first. Do not add speculative guards, fallbacks, retries, or edge-case handling unless the caller can actually hit that case or production has proven it necessary.
- Enforce eligibility and exclusivity rules at the earliest shared entry point. Do not repeat backup guards across downstream jobs, callbacks, services, or writes unless a proven independent path bypasses that point.
- When an impossible or misconfigured state would indicate a setup/deployment bug, let it fail loudly instead of silently skipping behavior.
- For locked/internal configs that must exist in production, prefer direct reads (`find`, `find_by!`, required hash keys) over silent fallbacks.
- Do not add validation or response checks unless the code uses the result or the check changes behavior meaningfully.
- Prefer existing repo dependencies/client libraries over hand-rolled protocol code for auth, signing, parsing, or API plumbing.
- Avoid one-use private helpers unless they hide real complexity or make the main flow meaningfully easier to read.
- Prefer minimal, readable code over elaborate abstractions; clarity beats cleverness
- Break down complex tasks into small, testable units
- Iterate after confirmation
- Avoid writing specs unless explicitly asked
- In specs, avoid custom helper methods for setup/data. Prefer `let` values and direct per-example setup; only add a helper when it removes meaningful repeated complexity.
- Remove dead/unreachable/unused code
- Don’t write multiple versions or backups for the same logic — pick the best approach and implement it
- Prefer `with_modified_env` (from spec helpers) over stubbing `ENV` directly in specs
- Specs in parallel/reloading environments: prefer comparing `error.class.name` over constant class equality when asserting raised errors

## SlideEdu Droplet / Deploy Notes (важно, читать перед деплоем)

- **Два независимых деплой-таргета на одном дропле**, не путать:
  - Основной Chatwoot (Rails+Vite) — systemd-юниты `chatwoot-web.1.service` / `chatwoot-worker.1.service`.
  - `agent-bot-scenarios/` — отдельный Node-процесс под pm2, имя процесса `slideedu-agent-bot`, живёт под линукс-юзером `chatwoot` (НЕ под root). Все pm2/node-команды для него — только `sudo -u chatwoot -i ...` (флаг `-i` обязателен, без него `spawn node EACCES`; `pm2 list` под root покажет ЧУЖОЙ процесс `slideedu-dev`, не наш).
  - У `agent-bot-scenarios` есть свой `deploy.sh` (npm install + vite build admin/dashboard + pm2 start/restart + health-check на `/health`). У основного Chatwoot — свой `deploy.sh` в корне репозитория (bundle install + assets:clobber → assets:precompile + рестарт systemd-юнитов + health-check). **Всегда сверяться с этими скриптами, а не гонять команды вручную по памяти.**
- **Ветка на дропле — `custom/slideedu-stage`, а не `custom/slideedu`.** Разошлись после коммита `9c202793d` (Bump version to 4.16.2). На дропле есть локальные коммиты (автор Dionisiy), которых нет на GitHub — обычный `git pull`/`git reset --hard origin/...` может их снести. Перед любым git-действием на дропле — свериться, не удивляться расхождению.
- **SSH-ключ дропла к GitHub может быть не настроен** (`git@github.com: Permission denied (publickey)`) — тогда `git pull`/`fetch` с дропла не работает вообще, пока ключ не почини́т пользователь. Пуш из локального рабочего чекаута на GitHub по HTTPS при этом работать может нормально.
- **Флоу изменений в коде: сначала весь код и правки — локально в репозитории, прогнать lint/синтаксис, и только потом деплоить на дроплет.** Не редактировать код бота прямо на сервере в обход локального репозитория (кроме случаев, когда git туда физически не достучаться и это явно оговорено как временный костыль).
- **`agent-bot-scenarios/src/flows.json` НЕ версионируется git'ом** (в `.gitignore`, живые данные редактора `/admin`). Редактировать его — либо через `/agent-bot/admin/` (UI или напрямую `GET`/`POST /agent-bot/admin/api/flows`, Basic Auth password = личный access token админа Chatwoot), либо через прямую правку файла на дропле. Никогда не считать, что локальная копия `flows.json` совпадает с боевой.
- **Обязательный порядок для Vite-сборки Chatwoot**: `assets:clobber` ДО `assets:precompile` — без этого прекомпиляция иногда молча не полностью пересобирает часть чанков (например виджет-бандл), и команда завершается без ошибок, но на сайте остаётся старая версия.
- **На этом дропле (2vCPU/4GB RAM + 8GB swap) дефолтный V8-хип падает в OOM при сборке Vite** — всегда явно поднимать лимит: `NODE_OPTIONS=--max-old-space-size=4096` перед `assets:clobber`/`assets:precompile`.
- Если `git add`/`git commit` в примонтированной рабочей папке ведут себя нестабильно (файлы молча выпадают из индекса, `.git/index.lock` не даёт себя удалить) — сначала вызвать `allow_cowork_file_delete` на конкретный файл лока, затем коммитить одной атомарной командой `git commit -- <единственный файл>` (не через отдельный `git add`).

## Codex Worktree Workflow

- Use a separate git worktree + branch per task to keep changes isolated.
- Keep Codex-specific local setup under `.codex/` and use `Procfile.worktree` for worktree process orchestration.
- The setup workflow in `.codex/environments/environment.toml` should dynamically generate per-worktree DB/port values (Rails, Vite, Redis DB index) to avoid collisions.
- Start each worktree with its own Overmind socket/title so multiple instances can run at the same time.

## Commit Messages

- Prefer Conventional Commits: `type(scope): subject` (scope optional)
- Example: `feat(auth): add user authentication`
- Don't reference Claude in commit messages

## PR Description Format

- Start with a short, user-facing paragraph describing the product change.
- Add a `Closes` section with relevant issue links (GitHub, Linear, etc.).
- For feature PRs, add `How to test` from a product/UX standpoint.
- For bugfix PRs, use `How to reproduce` when helpful.
- Optionally add a `What changed` section for implementation highlights.
- Do not add a `How this was tested` section listing specs/commands.

## Project-Specific

- **Translations**:
  - For product and source-string changes, only update `en.yml` and `en.json`; other languages are handled through Crowdin and the community
  - Crowdin-generated translation sync PRs may update non-English locale files; do not flag those changes solely for modifying translated locale files
  - Backend i18n → `en.yml`, Frontend i18n → `en.json`
- **Frontend**:
  - Use `components-next/` for message bubbles (the rest is being deprecated)

## Ruby Best Practices

- Use compact `module/class` definitions; avoid nested styles

## Enterprise Edition Notes

- Chatwoot has an Enterprise overlay under `enterprise/` that extends/overrides OSS code.
- When you add or modify core functionality, always check for corresponding files in `enterprise/` and keep behavior compatible.
- Follow the Enterprise development practices documented here:
  - https://chatwoot.help/hc/handbook/articles/developing-enterprise-edition-features-38

Practical checklist for any change impacting core logic or public APIs
- Search for related files in both trees before editing (e.g., `rg -n "FooService|ControllerName|ModelName" app enterprise`).
- If adding new endpoints, services, or models, consider whether Enterprise needs:
  - An override (e.g., `enterprise/app/...`), or
  - An extension point (e.g., `prepend_mod_with`, hooks, configuration) to avoid hard forks.
- Avoid hardcoding instance- or plan-specific behavior in OSS; prefer configuration, feature flags, or extension points consumed by Enterprise.
- Keep request/response contracts stable across OSS and Enterprise; update both sets of routes/controllers when introducing new APIs.
- When renaming/moving shared code, mirror the change in `enterprise/` to prevent drift.
- Tests: Add Enterprise-specific specs under `spec/enterprise`, mirroring OSS spec layout where applicable.
- When modifying existing OSS features for Enterprise-only behavior, add an Enterprise module (via `prepend_mod_with`/`include_mod_with`) instead of editing OSS files directly—especially for policies, controllers, and services. For Enterprise-exclusive features, place code directly under `enterprise/`.

## Branding / White-labeling note

- For user-facing strings that currently contain "Chatwoot" but should adapt to branded/self-hosted installs, prefer applying `replaceInstallationName` from `shared/composables/useBranding` in the UI layer (for example tooltip and suggestion labels) instead of adding hardcoded brand-specific copy.
