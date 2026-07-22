# LLM Chat Backend

Multi-session chat backend built with **Node.js**, **TypeScript**, **Fastify**, and **Prisma**.

## Prerequisites

- Node.js v22 or higher
- pnpm v9 or higher
- Docker + Docker Compose (for the containerized stack)
- PostgreSQL (provided by Compose, or any local instance)

## Project architecture

```text
                    ┌─────────────────────────────────────┐
                    │         Client (curl / Swagger)     │
                    └──────────────────┬──────────────────┘
                                       │ HTTP :3000
                    ┌──────────────────▼──────────────────┐
                    │           Fastify API server        │
                    │  sessions / messages routes         │
                    │  + Swagger UI (/docs)               │
                    │           │                         │
                    │  SessionsService / MessagesService  │
                    │           │                         │
                    │      LlmClient (interface)          │
                    │       ├─ StubLlmClient              │
                    │       └─ OpenAI-compatible HTTP     │
                    │            (Groq / NVIDIA / …)      │
                    └───────────┬─────────────────────────┘
                                │ Prisma
                    ┌───────────▼─────────────────────────┐
                    │         PostgreSQL 16               │
                    │     sessions 1 ──< messages         │
                    └─────────────────────────────────────┘
```

Compose runs `server` + `db`. Local development can run the API on the host and only start Postgres via Compose.

## Quick Start (Docker Compose — recommended)

Requires `apps/server/.env` (copy from `.env.example` first). Compose overrides `DATABASE_URL` so the API reaches the `db` service.

```bash
cp apps/server/.env.example apps/server/.env
# optional: set LLM_PROVIDER=groq and LLM_API_KEY=...

docker-compose up --build
```

Services:

| Service  | Host port | Notes                                      |
| -------- | --------- | ------------------------------------------ |
| `server` | `3000`    | Fastify API (`http://localhost:3000`)      |
| `db`     | `5434`    | Postgres 16 (mapped from container `5432`) |

On container start the API runs `prisma migrate deploy`, then listens on port 3000.

```bash
curl -s http://localhost:3000/health
docker-compose down          # stop
docker-compose down -v       # stop and delete DB volume
```

## Quick Start (local Node + existing Postgres)

```bash
pnpm install
cp apps/server/.env.example apps/server/.env
pnpm --filter server db:generate
pnpm --filter server db:migrate
pnpm dev
```

The API listens on `http://localhost:3000` by default (`PORT` / `HOST` in `.env`).

If you only want the Compose database while developing on the host:

```bash
docker-compose up db -d
# point apps/server/.env to:
# DATABASE_URL=postgresql://postgres:postgres@localhost:5434/llm_chat?schema=public
pnpm --filter server db:migrate
pnpm --filter server dev
```

## Database Schema and Field Design

We use **PostgreSQL** with **Prisma ORM**. The data model is intentionally small: one `Session` owns many `Message` rows.

### Entity relationship

```text
Session 1 ──< Message
```

### Tables

#### `sessions`

| Field        | Type            | Notes                      |
| ------------ | --------------- | -------------------------- |
| `id`         | `String` (cuid) | Primary key                |
| `title`      | `String?`       | Optional display title     |
| `created_at` | `DateTime`      | Set on create              |
| `updated_at` | `DateTime`      | Auto-updated on any change |

#### `messages`

| Field        | Type            | Notes                                    |
| ------------ | --------------- | ---------------------------------------- |
| `id`         | `String` (cuid) | Primary key                              |
| `session_id` | `String`        | FK → `sessions.id` (`ON DELETE CASCADE`) |
| `role`       | `MessageRole`   | Enum: `USER` \| `ASSISTANT` \| `SYSTEM`  |
| `content`    | `String`        | Message body                             |
| `created_at` | `DateTime`      | Set on create                            |

#### Indexes

- `messages (session_id, created_at)` — efficient chronological history per session

### How the data model supports session and message queries

| Use case                      | Query approach                                                              |
| ----------------------------- | --------------------------------------------------------------------------- |
| Create a session              | `INSERT` into `sessions`                                                    |
| List sessions                 | `SELECT` from `sessions` ordered by `updated_at DESC`                       |
| View a session                | `SELECT` one `sessions` row by `id`                                         |
| Message history for a session | `SELECT` from `messages` where `session_id = ?` ordered by `created_at ASC` |
| Add user + assistant messages | `INSERT` into `messages`; bump session `updated_at`                         |
| Delete a session              | `DELETE` session; related messages removed via **cascade**                  |

Prisma schema source: [`apps/server/prisma/schema.prisma`](apps/server/prisma/schema.prisma)

### Prisma commands (server package)

```bash
pnpm --filter server db:generate   # generate Prisma Client
pnpm --filter server db:migrate    # create/apply migrations
pnpm --filter server db:push       # push schema without migration files (dev only)
pnpm --filter server db:studio     # open Prisma Studio
```

## API Overview

Auth is intentionally omitted for this assignment.

### API documentation

| Format | Location |
| ------ | -------- |
| **Swagger UI** (interactive) | http://localhost:3000/docs |
| **OpenAPI JSON** | http://localhost:3000/docs/json |
| **Markdown reference** | [`docs/api.md`](docs/api.md) |

| Method   | Path                       | Description                                      |
| -------- | -------------------------- | ------------------------------------------------ |
| `GET`    | `/health`                  | Liveness check                                   |
| `POST`   | `/sessions`                | Create a conversation session                    |
| `GET`    | `/sessions`                | List sessions (newest `updatedAt` first)         |
| `GET`    | `/sessions/:id`            | Get one session                                  |
| `DELETE` | `/sessions/:id`            | Delete a session (messages cascade)              |
| `GET`    | `/sessions/:id/messages`   | List message history (oldest first)              |
| `POST`   | `/sessions/:id/messages`   | Add a user message and receive an LLM reply      |

### Examples

Create a session:

```bash
curl -s -X POST http://localhost:3000/sessions \
  -H 'content-type: application/json' \
  -d '{"title":"My first chat"}'
```

Send a message:

```bash
curl -s -X POST http://localhost:3000/sessions/<SESSION_ID>/messages \
  -H 'content-type: application/json' \
  -d '{"content":"Hello!"}'
```

Response shape for `POST /sessions/:id/messages`:

```json
{
  "userMessage": { "id": "...", "sessionId": "...", "role": "USER", "content": "Hello!", "createdAt": "..." },
  "assistantMessage": { "id": "...", "sessionId": "...", "role": "ASSISTANT", "content": "...", "createdAt": "..." }
}
```

### Message flow

1. Validate the session exists.
2. Load prior messages for that session (conversation context).
3. Call the LLM client with history + the new user message.
4. Persist both the user and assistant messages in one transaction.
5. Update the session (`updatedAt`; set `title` from the first user message if empty).

## LLM Integration

The server talks to LLMs through a small `LlmClient` interface. Production providers use an **OpenAI-compatible** Chat Completions HTTP client (plain `fetch` — no OpenAI SDK dependency).

| `LLM_PROVIDER` | Free-tier notes | Key |
| -------------- | --------------- | --- |
| `groq` (**recommended**) | High daily request allowance (thousands/day class); good for iterative homework testing | [console.groq.com/keys](https://console.groq.com/keys) |
| `nvidia` | Assignment suggestion; rate-limited prototyping tier (~40 RPM) | [build.nvidia.com](https://build.nvidia.com/settings/api-keys) |
| `stub` | Offline / no key; echo-style replies for local API testing | none |

Default model choices favor smaller models to conserve free-tier tokens:

- Groq: `llama-3.1-8b-instant`
- NVIDIA: `meta/llama-3.1-8b-instruct`

### Enable Groq (recommended)

1. Create a free API key at https://console.groq.com/keys
2. Update `apps/server/.env`:

```env
LLM_PROVIDER=groq
LLM_API_KEY=gsk_your_key_here
# optional:
# LLM_MODEL=llama-3.1-8b-instant
```

3. Restart the server (`pnpm --filter server dev`).

### Enable NVIDIA instead

```env
LLM_PROVIDER=nvidia
LLM_API_KEY=nvapi-your_key_here
# optional:
# LLM_MODEL=meta/llama-3.1-8b-instruct
```

You can also point at any OpenAI-compatible host with `LLM_PROVIDER=groq` (or `nvidia`) plus custom `LLM_BASE_URL` / `LLM_MODEL`.

## Automated tests

We use **Vitest** with Fastify's `app.inject()` for HTTP-level tests (no real TCP listen).

### How to run

```bash
# Postgres must be reachable (Compose DB on 5434 is fine):
docker-compose up db -d

pnpm --filter server test
# or from apps/server:
pnpm test
```

Tests target a dedicated database `llm_chat_test` (derived from `DATABASE_URL` in `.env`, or defaulting to `localhost:5434`). The suite creates that database if needed and runs `prisma migrate deploy` before API tests.

### Testing approach

| Layer | What we test | External deps |
| ----- | ------------ | ------------- |
| **API (integration)** | Session CRUD, message create/list, validation, 404s, cascade delete | Real Postgres; **LLM injected as a fake/stub** via `buildApp({ llm })` |
| **LLM client (unit)** | OpenAI-compatible request shape, 429 mapping, empty-body errors | `fetch` mocked with `vi.stubGlobal` — **no real provider calls** |
| **Factory / stub (unit)** | `createLlmClient` wiring; `StubLlmClient` echo behavior | none |

`buildApp` accepts optional `llm` / `prisma` so API tests never need a Groq/NVIDIA key. We deliberately do **not** hit live LLM APIs in CI/local automated runs.

## Build vs. reuse decisions

| Decision | Choice | Tradeoff |
| -------- | ------ | -------- |
| HTTP framework | **Reuse Fastify** instead of a custom Node HTTP server | Route plugins, validation hooks, and `app.inject()` testing come free; slightly more framework surface than raw `http`. |
| Persistence | **Reuse Prisma + Postgres** instead of hand-rolled SQL or an in-memory store | Migrations, typed client, and cascade deletes are quick to ship; adds an ORM dependency and requires a running DB for tests. |
| LLM HTTP client | **Build a thin OpenAI-compatible `fetch` client** instead of the official OpenAI SDK | One small module covers Groq, NVIDIA, and other compatible hosts with no extra SDK weight; we own retries/error mapping ourselves rather than inheriting SDK defaults. |

## Project status

- [x] Prisma schema (`Session` + `Message`)
- [x] Session / message APIs (Fastify)
- [x] LLM integration (Groq recommended; NVIDIA + stub supported)
- [x] Docker Compose (`server` + Postgres)
- [x] API documentation (Swagger UI + `docs/api.md`)
- [x] Automated tests (Vitest)
