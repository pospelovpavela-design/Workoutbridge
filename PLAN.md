# Workoutbridge — App Plan

## Overview

Workoutbridge — веб-приложение, которое автоматически транслирует тренировки из **Strava** в **Nike Running Club** через **Garmin Connect**.

**Ключевая идея потока:**
```
Strava → [Workoutbridge] → Garmin Connect → Nike Running Club
                                             (автоматически, без участия приложения)
```

Пользователь один раз настраивает связку Garmin ↔ NRC через официальный интерфейс Garmin. После этого Workoutbridge занимается только синхронизацией Strava → Garmin.

---

## User Flow

1. Пользователь регистрируется / входит в Workoutbridge
2. Подключает аккаунт **Strava** (OAuth 2.0)
3. Подключает аккаунт **Garmin Connect** (OAuth 2.0)
4. Единожды в Garmin Connect вручную связывает аккаунт с Nike Running Club (приложение показывает инструкцию)
5. Workoutbridge подписывается на Strava Webhook — новые тренировки приходят автоматически
6. При каждой новой активности: скачивает из Strava → конвертирует → загружает в Garmin
7. Garmin автоматически отправляет в Nike Running Club
8. Пользователь видит лог синхронизаций в дашборде

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Frontend (Next.js)              │
│  Dashboard | Connections | Sync Log | Settings  │
└──────────────────────┬──────────────────────────┘
                       │ REST / tRPC
┌──────────────────────▼──────────────────────────┐
│              Backend (Next.js API Routes)        │
│                                                  │
│  Auth Service    │  Sync Service  │  Webhook     │
│  (NextAuth)      │  (jobs)        │  Handler     │
└────┬─────────────┴───────┬────────┴──────┬───────┘
     │                     │               │
┌────▼──────┐   ┌──────────▼────┐  ┌──────▼──────┐
│ PostgreSQL │   │  Redis + BullMQ│  │ Strava      │
│ (users,    │   │  (job queue)  │  │ Webhook     │
│  tokens,   │   └──────────────┘  │ endpoint    │
│  sync log) │                     └─────────────┘
└───────────┘

External APIs:
  Strava API v3       — получение активностей + webhook
  Garmin Connect API  — загрузка активностей (FIT/TCX)
  Nike Running Club   — не используется (синхронизация через Garmin)
```

---

## Tech Stack

| Слой           | Технология                          |
|----------------|-------------------------------------|
| Frontend       | Next.js 15 (App Router), React 19   |
| Styling        | Tailwind CSS                        |
| Backend        | Next.js API Routes                  |
| Auth           | NextAuth.js v5                      |
| Database       | PostgreSQL (Neon / Supabase)        |
| ORM            | Drizzle ORM                         |
| Job Queue      | BullMQ + Redis (Upstash)            |
| File Convert   | fit-file-writer / FIT SDK           |
| Hosting        | Vercel                              |
| Deployment     | GitHub Actions CI/CD                |

---

## API Integrations

### Strava API v3

| Что используем       | Endpoint / метод                               |
|----------------------|------------------------------------------------|
| OAuth авторизация    | `/oauth/authorize`, `/oauth/token`             |
| Получить активность  | `GET /activities/{id}`                         |
| Получить стримы      | `GET /activities/{id}/streams` (lat/lng, hr, cadence, watts) |
| Скачать FIT/GPX      | `GET /activities/{id}/export_gpx` (только owner) |
| Webhook подписка     | `POST /push_subscriptions`                     |
| Webhook события      | `activity:create` event                        |

**Scope:** `activity:read_all`

### Garmin Connect API

Garmin не имеет официального публичного API для загрузки активностей третьими сторонами.  
Используем **Garmin Health API** (официальный партнёрский путь) **или** неофициальный эндпоинт загрузки файлов.

| Подход                   | Pros                          | Cons                              |
|--------------------------|-------------------------------|-----------------------------------|
| Garmin Health API        | Официальный, стабильный       | Нужна партнёрская заявка в Garmin |
| Upload endpoint (неофиц) | Работает сейчас               | Может сломаться при обновлениях   |

**Upload endpoint (текущий подход для MVP):**
```
POST https://connectapi.garmin.com/upload-service/upload
Content-Type: multipart/form-data
Authorization: Bearer <token>
Body: FIT file
```

OAuth 2.0 через `sso.garmin.com`.

**Scope:** `CONNECT_WRITE` (доступ к загрузке активностей)

### Nike Running Club → Garmin

Пользователь в Garmin Connect: **Connected Apps → Nike Run Club**.  
После связки Garmin автоматически пушит каждую новую активность в NRC.  
Workoutbridge не взаимодействует с NRC API напрямую.

---

## Database Schema

```sql
-- Пользователи
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- OAuth токены провайдеров
CREATE TABLE provider_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,           -- 'strava' | 'garmin'
  access_token    TEXT NOT NULL,
  refresh_token   TEXT,
  expires_at      TIMESTAMPTZ,
  athlete_id      TEXT,                    -- внешний ID пользователя у провайдера
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, provider)
);

-- Лог синхронизаций
CREATE TABLE sync_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES users(id) ON DELETE CASCADE,
  strava_activity_id BIGINT NOT NULL,
  garmin_activity_id TEXT,
  status            TEXT NOT NULL,         -- 'pending' | 'success' | 'error'
  error_message     TEXT,
  synced_at         TIMESTAMPTZ DEFAULT now()
);

-- Strava webhook подписки
CREATE TABLE webhook_subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  strava_sub_id   BIGINT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

---

## Sync Job Pipeline

```
1. Strava Webhook Event (activity:create)
        │
        ▼
2. Validate webhook signature
        │
        ▼
3. Enqueue BullMQ job { userId, stravaActivityId }
        │
        ▼
4. Worker: fetch activity details from Strava
        │
        ▼
5. Worker: fetch activity streams (GPS, HR, cadence, power)
        │
        ▼
6. Worker: convert to FIT file format
        │
        ▼
7. Worker: upload FIT to Garmin Connect
        │
        ▼
8. Update sync_events record (success / error)
        │
        ▼
9. Garmin → NRC (автоматически, Garmin's side)
```

**Retry стратегия:** exponential backoff, 3 попытки, dead letter queue для failed jobs.

---

## Pages & UI

| Страница          | Описание                                              |
|-------------------|-------------------------------------------------------|
| `/`               | Landing page: описание, CTA "Start syncing"           |
| `/dashboard`      | Статус подключений + последние синхронизации          |
| `/connect/strava` | OAuth flow → Strava                                   |
| `/connect/garmin` | OAuth flow → Garmin                                   |
| `/sync-log`       | История всех синхронизаций с деталями                 |
| `/settings`       | Управление подключениями, отключить синхронизацию     |

---

## Development Phases

### Phase 1 — Foundation (Week 1-2)
- [ ] Next.js проект, TypeScript, Tailwind, Drizzle + PostgreSQL
- [ ] NextAuth: email/password авторизация пользователей
- [ ] Landing page + базовый дашборд

### Phase 2 — Strava Integration (Week 2-3)
- [ ] Strava OAuth подключение
- [ ] Strava Webhook: подписка и обработка событий
- [ ] Получение и парсинг активностей + стримов

### Phase 3 — FIT Conversion (Week 3-4)
- [ ] Конвертер Strava streams → FIT file
- [ ] Поддержка типов: Run, Ride, Walk, Swim
- [ ] Тесты конвертации

### Phase 4 — Garmin Integration (Week 4-5)
- [ ] Garmin OAuth подключение
- [ ] Загрузка FIT файла в Garmin Connect
- [ ] Обработка ошибок и дубликатов

### Phase 5 — Queue & Reliability (Week 5-6)
- [ ] BullMQ + Redis job queue
- [ ] Retry логика, dead letter queue
- [ ] Мониторинг очереди

### Phase 6 — Polish & Launch (Week 6-7)
- [ ] Sync log UI
- [ ] Onboarding: инструкция по подключению NRC в Garmin
- [ ] Email уведомления об ошибках синхронизации
- [ ] Production deploy (Vercel + Neon + Upstash)

---

## Key Risks & Mitigations

| Риск                                      | Митигация                                                   |
|-------------------------------------------|-------------------------------------------------------------|
| Garmin нет публичного API для загрузки    | Использовать неофициальный upload endpoint для MVP, подать заявку на партнёрство |
| Strava изменит API                        | Версионировать клиент, мониторить changelog                 |
| Garmin → NRC не срабатывает              | Документировать требования к настройке на стороне Garmin    |
| FIT конвертация теряет данные             | Тесты с реальными активностями, проверка через Garmin viewer |
| Rate limits Strava (100 req/15min)        | Очередь с throttling, кеш активностей                       |

---

## Out of Scope (MVP)

- Прямая интеграция с Nike API (нет публичного API)
- Мобильное приложение
- Синхронизация исторических активностей (только новые через webhook)
- Другие провайдеры (Polar, Suunto, etc.)
- Платные планы / монетизация
