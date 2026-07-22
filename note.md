# 開發過程筆記（依實作順序）

本文件記錄這份 LLM Chat Backend 作業是**依什麼順序做出來的**、各階段出現哪些程式／檔案，以及為什麼這樣做。  
對照作業需求編號：1 Sessions → 2 LLM → 3 Local DB → 4 API Docs → 5 Docker → 6 Tests → 7 Build vs Reuse（寫在 README）。

> 說明：實作時我們**先定資料模型（DB schema）再寫 API**，比作業清單「先 API、後 DB」更務實；Docker 則在 API／LLM 可跑通後才整包容器化。README 最終把 Compose 放在 Quick Start 前面，是為了讓評審一鍵啟動，不是代表開發一開始就只靠 Docker。

---

## 階段 0｜選技術與目錄（規劃，尚未寫業務碼）

**做了什麼**

- 沿用既有 **pnpm + Turborepo** monorepo，主程式放在 `apps/server`。
- 選定：**Node.js + TypeScript + Fastify + Prisma + PostgreSQL**。

**理由**

- 作業允許自選框架；Fastify 輕、測試可用 `app.inject()`。
- Prisma 適合在有限時間內把 schema／migration／型別一次搞定。
- 不另拆第二層 monorepo，避免超時在基建上。

---

## 階段 1｜定 Prisma schema（對應需求 3 的資料面）

**出現／新增的檔案**

| 路徑 | 用途 |
|------|------|
| `apps/server/prisma/schema.prisma` | `Session`、`Message`、`MessageRole`、cascade、複合索引 |
| `apps/server/prisma/migrations/20260720120000_init/` | 初始 migration SQL |
| `apps/server/src/lib/prisma.ts` | Prisma Client singleton |
| `apps/server/.env.example` | `DATABASE_URL` 等環境變數範本 |
| `apps/server/package.json` | 加上 `db:generate` / `db:migrate` 等 script；Prisma 鎖 **v6** |
| `README.md`（初版片段） | 用英文記錄 schema 與欄位設計 |

**資料模型重點**

- `Session` 1 ──\< `Message`
- 刪 session → **cascade** 刪 messages
- 索引 `(session_id, created_at)`：依時間撈某 session 歷史

**理由**

- 多 session 聊天的核心是「會話 + 訊息」；先把表定好，後面 API 才有地方寫入。
- Prisma v6：避開當時 v7 adapter 設定複雜度，省時間。
- 此時還沒強制起 DB；migration 檔先寫好，等有 Postgres 再套用。

**當時狀態**：還不能做有意義的功能測試（沒有 Fastify 業務 API）。

---

## 階段 2｜Session／Message API + Stub LLM（對應需求 1，並為需求 2 留介面）

**出現／新增的檔案**

| 路徑 | 用途 |
|------|------|
| `apps/server/src/config/env.ts` | 讀取 `PORT`、`HOST`、`DATABASE_URL`、`LLM_*` |
| `apps/server/src/lib/errors.ts` | `AppError` / `NotFoundError` / `LlmError` 等 |
| `apps/server/src/lib/serialize.ts` | Prisma 模型 → JSON 回應形狀 |
| `apps/server/src/app.ts` | `buildApp()`：組裝 Fastify、注入 prisma／llm |
| `apps/server/src/index.ts` | 啟動 listen |
| `apps/server/src/modules/sessions/*` | routes / service / schema（CRUD session） |
| `apps/server/src/modules/messages/*` | routes / service / schema（歷史 + 發訊息） |
| `apps/server/src/llm/llm.client.ts` | `LlmClient` 介面 + **`StubLlmClient`** + factory |

**API 行為（此階段已定型）**

- `POST/GET/DELETE /sessions`、`GET /sessions/:id`
- `GET/POST /sessions/:id/messages`
- 發訊息流程：確認 session → 載入歷史 → 呼叫 LLM → **同一 transaction** 寫入 user + assistant，並更新 session

**理由**

- 先用 **stub**，不依賴真實 API key，就能驗證「寫進 DB + 回傳雙訊息」。
- `LlmClient` 介面讓之後換 Groq／NVIDIA **不用改 route**。
- `buildApp({ llm, prisma })` 預留測試注入點（之後自動化測試會用到）。

**本機 DB 怎麼來**

- 作業要求「本機資料庫」，不一定要手動安裝 Postgres。
- 實務上用本機 Postgres（或稍後 Compose 的 `db`）+ `pnpm --filter server db:migrate`。
- Host 埠後來統一成 **5434**，避免和本機已佔用的 5432 衝突。

---

## 階段 3｜接真實 LLM（對應需求 2）

**出現／新增的檔案**

| 路徑 | 用途 |
|------|------|
| `apps/server/src/llm/openai-compatible.client.ts` | 用原生 `fetch` 打 OpenAI-compatible Chat Completions |
| `apps/server/src/llm/llm.client.ts`（擴充） | factory 支援 `stub` \| `groq` \| `nvidia` |
| `apps/server/.env.example`（更新） | `LLM_PROVIDER`、`LLM_API_KEY`、可選 `LLM_MODEL` / `LLM_BASE_URL` |
| `README.md`（更新） | LLM 整合說明；**推薦 Groq** |

**理由**

- 作業建議 NVIDIA；我們選 **Groq 為推薦**：免費額度偏「每天可打很多 request」，比較適合反覆作業測試，比較不像容易提早用完的 credit 制。
- **自己寫薄 client、不用官方 OpenAI SDK**：一個小模組就能接多家相容端點（也是 README「Build vs. reuse」裡「故意自建」的例子）。
- 預設用較小模型（如 `llama-3.1-8b-instant`）節省額度。

**驗證方式**：`.env` 設 `LLM_PROVIDER=groq` + key → 重啟 → `POST .../messages` 應不再出現 `Stub reply: ...`。

---

## 階段 4｜Docker Compose 整包（對應需求 5）

**出現／新增的檔案**

| 路徑 | 用途 |
|------|------|
| `docker-compose.yml` | `db`（Postgres 16）+ `server`（API） |
| `apps/server/Dockerfile` | 建置／執行 API image |
| `apps/server/docker-entrypoint.sh` | 啟動前 `prisma migrate deploy` 再聽 port |
| `.dockerignore` | 縮小 build context |
| Prisma `binaryTargets` | 加上 Debian／linux-arm64，讓 Client 在容器內可跑 |

**理由**

- 需求 5：把不同服務包成 image，用 Docker 管理啟動。
- Entrypoint 自動 migrate：評審 `up --build` 後不必手動跑 migration。
- Compose 覆寫容器內 `DATABASE_URL` 指向服務名 `db:5432`；本機 Node 則連 `localhost:5434`。

**實務踩過的坑（值得記）**

- `docker-compose up db -d` **只起 DB**，不會有 `llm-chat-server` → Swagger／curl `:3000` 會失敗或打到本機殘留行程。
- `docker-compose down -v` 會刪 volume → DB「變空」是預期行為。
- 完整驗證要用：`docker-compose up --build`（或 `-d`），`ps` 看到 **db + server** 兩個都 Up。

---

## 階段 5｜API 文件（對應需求 4）

**出現／新增的檔案**

| 路徑 | 用途 |
|------|------|
| `apps/server/src/plugins/swagger.ts` | `@fastify/swagger` + Swagger UI |
| `docs/api.md` | Markdown 參考文件 |
| 各 `*.routes.ts` / `*.schema.ts` | 補 summary、description、response schema |
| `README.md`（更新） | 標明 `/docs`、`/docs/json`、`docs/api.md` |

**理由**

- 作業允許「網頁或專案內檔案」；我們兩者都做：互動用 Swagger，離線／GitHub 用 Markdown。
- Schema 寫在 route 旁，OpenAPI 與實作較不易漂移。

**驗證**：`http://localhost:3000/docs`；若 Try it out `Failed to fetch`，先確認 `llm-chat-server` 有在跑，並統一用 `localhost`（避免混 `127.0.0.1` 的瀏覽器問題）。

---

## 階段 6｜自動化測試（對應需求 6）

**出現／新增的檔案**

| 路徑 | 用途 |
|------|------|
| `apps/server/vitest.config.ts` | Vitest 設定 |
| `apps/server/test/setup.ts` | 測試環境變數（如 `LLM_PROVIDER=stub`） |
| `apps/server/test/helpers.ts` | 測試用 `buildApp`／清理等 |
| `apps/server/test/sessions.api.test.ts` | Session API 整合測試 |
| `apps/server/test/messages.api.test.ts` | Message API 整合測試（LLM 注入假物件） |
| `apps/server/src/llm/llm.client.test.ts` | factory／stub 單元測試 |
| `apps/server/src/llm/openai-compatible.client.test.ts` | mock `fetch`、錯誤碼對應 |
| `README.md`（更新） | 如何跑測試、測試策略說明 |

**理由**

- 測「選什麼測、怎麼隔離外部依賴」比追求覆蓋率重要。
- API 測：**真 Postgres**（獨立庫 `llm_chat_test`）+ **假 LLM**（注入），不打真實 Groq／NVIDIA。
- LLM client 測：mock `fetch`，驗證 request 形狀與 429／空回應等邊界。

**怎麼跑**

```bash
docker-compose up db -d   # 或已有可連的 Postgres
pnpm --filter server test
```

---

## 階段 7｜README 對齊繳交清單（含需求 7）

**調整內容（大致順序）**

1. Project architecture（架構圖）
2. How to start（Compose recommended + local Node）
3. Database schema + how queries are supported
4. API Overview + 文件連結
5. LLM Integration
6. Automated tests（怎麼跑 + approach）
7. **Build vs. reuse decisions**（2–3 個取捨）
8. Project status

**Build vs. reuse（已寫在 README，這裡是精簡版）**

| 決策 | 類型 | 一句話 |
|------|------|--------|
| Fastify | Reuse | 少寫 HTTP 基建，換框架表面積 |
| Prisma + Postgres | Reuse | migration／型別／cascade 快，測試需真 DB |
| 自寫 OpenAI-compatible `fetch` client | Build | 不引入 OpenAI SDK，一家程式接多家端點 |

**Bonus 未做**：Local LLM（2.1）、Streaming（2.2）、公開部署（8）——時間內刻意跳過，符合作業「先核心、Bonus 有空再做」。

---

## 檔案出現時間軸（對照用）

```text
階段 1  schema.prisma, migrations, lib/prisma.ts, .env.example
    ↓
階段 2  config/env, lib/errors, lib/serialize, app.ts, index.ts
        modules/sessions/*, modules/messages/*, llm/llm.client.ts (stub)
    ↓
階段 3  llm/openai-compatible.client.ts, env／README 的 Groq／NVIDIA
    ↓
階段 4  docker-compose.yml, Dockerfile, docker-entrypoint.sh, .dockerignore
    ↓
階段 5  plugins/swagger.ts, docs/api.md, route／schema 註解
    ↓
階段 6  vitest + test/* + llm/*.test.ts
    ↓
階段 7  README 章節順序與 Build vs. reuse、架構圖
```

---

## 兩種合法啟動模式（開發時容易搞混）

| 模式 | 指令概念 | `:3000` 是誰 | DB |
|------|----------|--------------|-----|
| 全 Docker（對應需求 5） | `docker-compose up --build` | `llm-chat-server` | 容器內 `db:5432`（host 看 5434） |
| 本機 API + Docker DB | `up db -d` + `pnpm --filter server dev` | 本機 Node | `.env` 用 `localhost:5434` |

不要混用：以為在測 Docker API，其實打到本機殘留行程；或只有 db Up 卻開 `/docs`。

---

## 一句話總結

開發順序是：**模型 → API（stub）→ 真 LLM → Docker → 文件 → 測試 → README 補齊取捨說明**。  
程式上刻意把 LLM 與 HTTP／DB 解耦，所以後面換 provider、寫測試、上容器時不用重寫業務路由。
