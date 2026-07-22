# Prisma／Schema 筆記

用更白話的方式從頭講。

## 1. 先搞清楚：Prisma 在專案裡扮演什麼角色

你在 `schema.prisma` 裡定義了資料表（`Session`、`Message`）。  
跑 `prisma generate` 之後，會產生一個叫 **`PrismaClient`** 的類別。

這個 class 的用途很單純：

> **程式 ↔ PostgreSQL 的翻譯官**  
> 你寫 `prisma.session.create(...)`，它幫你變成 SQL，送到資料庫，再把結果變回 JS 物件。

所以專案裡幾乎所有「讀寫 DB」的動作，最後都會經過某個 `PrismaClient` 實例。

例如 `SessionsService`：

```12:17:apps/server/src/modules/sessions/sessions.service.ts
  create(input: CreateSessionInput = {}): Promise<Session> {
    return this.prisma.session.create({
      data: {
        title: input.title?.trim() || null,
      },
    });
  }
```

這裡的 `this.prisma`，平常就是從 `lib/prisma.ts` 匯出的那一個。

---

## 2. `prisma.ts` 到底在解決什麼問題？

你可以想像：資料庫連線像「打電話」。

- 每次需要查資料就 `new PrismaClient()` = 每次都重新撥一通電話  
- 長期下來會開很多連線，浪費資源，開發熱重載時更容易爆

所以這個檔案做的是：

> **整個 server 共用「同一支」Prisma 電話（單例 singleton）**  
> 所有模組 `import { prisma } from './lib/prisma.js'` 拿到的都是同一個物件。

流程大致是：

```text
HTTP 請求
  → Fastify routes
  → SessionsService / MessagesService
  → prisma.session.xxx / prisma.message.xxx   ← 來自 lib/prisma.ts
  → PostgreSQL
```

在 `app.ts` 裡可以看到預設怎麼接上：

```31:42:apps/server/src/app.ts
  const db = options.prisma ?? defaultPrisma;
  ...
  const sessionsService = new SessionsService(db);
  const messagesService = new MessagesService(db, llm);
```

- 平常：`defaultPrisma`（就是 `lib/prisma.ts` 那個）  
- 測試時：可以傳別的 `prisma` 進去（或共用同一個測測試庫）

---

## 3. 逐行解釋

```1:19:apps/server/src/lib/prisma.ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

### 第 1 行
從 Prisma 產生的套件把 `PrismaClient` 類別拿進來。

### 第 3–5 行：`globalForPrisma`
`globalThis` 是 JS 裡「整個行程共用」的全域物件（在 Node 裡類似 `global`）。

這裡把它 typcast 成：上面可以掛一個可選的 `prisma` 屬性。

為什麼需要？因為開發時模組會被重複載入（下面第 4 節詳說）。  
模組自己的變數會重設，但 `globalThis` 上的東西通常還在。

### 第 7–14 行：建立或重用 `prisma`
邏輯是：

```text
若 globalThis 上已經有 prisma → 直接用舊的
否則 → new PrismaClient(...) 建一個新的
```

`??` 就是「左邊是 `null` / `undefined` 才用右邊」。

`log` 設定：

| 環境 | 打什麼 log |
|------|------------|
| `development` | SQL query + error + warn（方便除錯） |
| 其他（production / test 等） | 只打 error，少吵、少洩漏 |

### 第 16–18 行：開發時把實例存回 global
非 production（開發、通常也含 test）時，把剛拿到的 `prisma` 存到 `globalThis`。

下次這個檔案再被執行一次時，第 7–8 行就會找到舊實例，不會再 `new`。

Production 為什麼不存？  
正式環境通常不會像 `tsup --watch` 那樣反覆熱重載模組；行程起來一次、建一次 client 就夠了。不往 global 掛也可以，這是常見慣例。

---

## 4. 為什麼一定要「掛 global」？開發熱重載的故事

你本地常用類似：

```bash
pnpm --filter server dev
```

改程式 → `tsup` 重新打包 → Node 再載入新模組。

若 `prisma.ts` 寫成這樣（**沒有** global）：

```ts
export const prisma = new PrismaClient();
```

每次熱重載都會：

1. 再執行一次這個檔案  
2. 再 `new PrismaClient()`  
3. 再開一組 DB 連線  

舊的 client 可能還沒被清掉 → 連線越來越多 → 最後可能出現「too many connections」之類問題。

加上 global 之後：

```text
第一次載入：new PrismaClient → 存到 globalThis.prisma
第二次熱重載：看到 global 已有 → 直接重用，不再 new
```

這就是為什麼短短 19 行看起來有點「繞」——重點不是業務邏輯，而是**開發體驗與連線安全**。

---

## 5. 它「不會」做哪些事？

容易誤會，先釐清：

| 不是做這個 | 真正誰在做 |
|------------|------------|
| 定義資料表結構 | `schema.prisma` |
| 建立／遷移資料表 | `prisma migrate` |
| 寫業務規則（建 session、叫 LLM） | `sessions.service` / `messages.service` |
| 聽 HTTP port | `index.ts` + Fastify |

`prisma.ts` **只負責：準備好一個可重複使用的 DB client，並匯出給別人用。**

---

## 6. 用生活比喻收斂

- `schema.prisma` = 倉庫的貨架配置圖  
- `PrismaClient` = 倉庫管理員（會照圖找貨、放貨）  
- `lib/prisma.ts` = **整間公司只請一位管理員，門禁卡都指向同一人**；開發時若辦公室重建（熱重載），還是叫同一位管理員回來上班，不要每次重建都再雇新人

---

若還卡在某一段，可以指定例如「`globalThis` 到底長什麼樣」或「`app.ts` 的 `options.prisma` 測試時怎麼用」，我可以再往下拆那一塊。

本檔整理專案裡與 **Prisma、`schema.prisma`、migration、Client（`lib/prisma.ts`）** 有關的說明。  
Docker「只有 db、沒有 server」等除錯請看 [`record.md`](record.md)。

---

## 1. 和「以前手寫 SQL 建表」的對照

```text
以前：
  人寫 CREATE TABLE ...  →  在 DB 執行  →  表存在，再寫應用程式去查

現在（這個專案）：
  人寫 schema.prisma（規格書）
       ↓
  prisma migrate   →  自動生出 migration.sql（本質仍是 CREATE TABLE）
       ↓
  套用到 PostgreSQL  →  sessions / messages 真的出現
       ↓
  prisma generate  →  產生 Prisma Client，應用程式用 TS API 操作這些表
```

**重點：兩種「產生」不要混**

| 指令 | 實際在產生什麼 | 資料庫裡會不會出現 table？ |
|------|----------------|---------------------------|
| `pnpm --filter server db:generate`（=`prisma generate`） | 產生 **TypeScript 用的 Prisma Client**（才能寫 `prisma.session.create`） | **不會** |
| `pnpm --filter server db:migrate`（=`prisma migrate dev`） | 依 schema **產生／套用 migration SQL**，在 Postgres 建表 | **會** |
| Docker 啟動時 `prisma migrate deploy`（entrypoint） | 把已有的 migration **套到容器裡的 DB** | **會** |
| `pnpm --filter server db:push` | 把 schema 直接推到 DB（偏開發、不一定留 migration 檔） | **會** |

真正讓 Postgres「長出可以輸入的 table」的是 **migrate／deploy／push**，不是 `generate`。

---

## 2. 資料模型（`schema.prisma`）

關聯：`Session` 1 ──\< `Message`；刪 session 時 **cascade** 刪 messages。  
索引：`(session_id, created_at)` 加速依時間撈某 session 歷史。

### Session（表名 `sessions`）

| 欄位（TS） | DB 欄位 | 說明 |
|------------|---------|------|
| `id` | `id` | cuid 主鍵 |
| `title?` | `title` | 可選標題（常由首則 user message 帶入） |
| `createdAt` | `created_at` | 建立時間 |
| `updatedAt` | `updated_at` | 有變更時自動更新 |
| `messages` | — | 關聯，非獨立欄位 |

### Message（表名 `messages`）

| 欄位（TS） | DB 欄位 | 說明 |
|------------|---------|------|
| `id` | `id` | cuid 主鍵 |
| `sessionId` | `session_id` | FK → `sessions.id`，`ON DELETE CASCADE` |
| `role` | `role` | enum：`USER` \| `ASSISTANT` \| `SYSTEM` |
| `content` | `content` | 訊息內文 |
| `createdAt` | `created_at` | 建立時間 |

### schema 裡其他設定

- **`datasource`**：`postgresql`，連線字串來自環境變數 `DATABASE_URL`。
- **`generator` / `binaryTargets`**：`native`（本機）+ Debian／linux-arm64，讓 Docker 容器內也能跑 Prisma Client 引擎。
- **Prisma 版本**：鎖定 **v6**（避開當時 v7 adapter 設定複雜度）。

來源檔：[`apps/server/prisma/schema.prisma`](apps/server/prisma/schema.prisma)

---

## 3. 相關檔案

| 路徑 | 用途 |
|------|------|
| `apps/server/prisma/schema.prisma` | 模型定義（規格書） |
| `apps/server/prisma/migrations/20260720120000_init/` | 初始 migration SQL（等同自動產生的 `CREATE TABLE`） |
| `apps/server/src/lib/prisma.ts` | Prisma Client **單例**（整個 server 共用一個連線管理員） |
| `apps/server/.env.example` | `DATABASE_URL` 等環境變數範本 |
| `apps/server/docker-entrypoint.sh` | 容器啟動先 `migrate deploy` 再開 API |

初始 migration 片段概念上就是：

```sql
CREATE TABLE "sessions" ( ... );
CREATE TABLE "messages" ( ... );
CREATE INDEX "messages_session_id_created_at_idx" ON "messages"("session_id", "created_at");
```

---

## 4. 常用指令

```bash
# 產生 Client（給程式 import @prisma/client）— 不建表
pnpm --filter server db:generate

# 開發：依 schema 建／套用 migration（需 Postgres 已在跑）
pnpm --filter server db:migrate

# 正式／Docker：只套用既有 migration 檔
pnpm --filter server db:migrate:deploy
# （容器內由 docker-entrypoint.sh 自動跑）

# 開發捷徑：直接推 schema，不強調 migration 檔
pnpm --filter server db:push

# GUI 看表資料
pnpm --filter server db:studio
```

本機開發連 Docker Postgres 時，`.env` 典型為：

```text
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/llm_chat?schema=public
```

Compose 裡 **server 容器**連 DB 用服務名（不是 localhost）：

```text
DATABASE_URL=postgresql://postgres:postgres@db:5432/llm_chat
```

- `db` = compose 服務名（容器網路內）  
- Host 的 **5434** 只給本機 Node／`psql`／Studio 從外面連進來用  

---

## 5. 怎麼查看 DB 裡的內容

Compose 的 DB 容器名 `llm-chat-db`，對外 **localhost:5434**，帳密都是 `postgres`，庫名 `llm_chat`。

### 方法 1：進容器用 `psql`

```bash
docker exec -it llm-chat-db psql -U postgres -d llm_chat
```

```sql
\dt
SELECT * FROM sessions ORDER BY updated_at DESC;
SELECT * FROM messages ORDER BY created_at ASC;
\q
```

### 方法 2：一行查完

```bash
docker exec -it llm-chat-db psql -U postgres -d llm_chat \
  -c "SELECT id, title, created_at, updated_at FROM sessions ORDER BY updated_at DESC;"

docker exec -it llm-chat-db psql -U postgres -d llm_chat \
  -c "SELECT id, session_id, role, left(content, 80) AS content, created_at FROM messages ORDER BY created_at ASC;"
```

### 方法 3：本機 `psql` 或 Prisma Studio

```bash
psql "postgresql://postgres:postgres@localhost:5434/llm_chat"
```

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5434/llm_chat?schema=public" \
  pnpm --filter server db:studio
```

瀏覽器會開 GUI 看表資料。

> `docker-compose down -v` 會刪 volume → 表結構可再靠 migrate 重建，但**資料會空**，屬預期行為。

---

## 6. Prisma 在專案裡扮演什麼角色？

你在 `schema.prisma` 定義表之後，跑 `prisma generate` 會產生 **`PrismaClient`** 類別。

用途很單純：

> **程式 ↔ PostgreSQL 的翻譯官**  
> 你寫 `prisma.session.create(...)`，它變成 SQL 送到 DB，再把結果變回 JS 物件。

幾乎所有讀寫 DB 都會經過某個 `PrismaClient` 實例。例如：

```ts
// SessionsService
return this.prisma.session.create({
  data: { title: input.title?.trim() || null },
});
```

這裡的 `this.prisma`，平常就是 `lib/prisma.ts` 匯出的那一個。

### 請求怎麼走到 DB

```text
HTTP 請求
  → Fastify routes
  → SessionsService / MessagesService
  → prisma.session.xxx / prisma.message.xxx   ← 來自 lib/prisma.ts
  → PostgreSQL
```

`app.ts` 預設：

```ts
const db = options.prisma ?? defaultPrisma; // defaultPrisma = lib/prisma.ts
const sessionsService = new SessionsService(db);
const messagesService = new MessagesService(db, llm);
```

測試時可 `buildApp({ prisma })` 注入別的 client／測測試庫。

---

## 7. `lib/prisma.ts`：為什麼要單例＋掛 global？

檔案職責：**準備好可重複使用的 DB client 並匯出**（不是定義表、也不是跑 migration）。

### 在解決什麼問題？

資料庫連線像打電話：

- 每次 `new PrismaClient()` = 每次重撥 → 連線變多，熱重載更容易爆  
- 這個檔案 = **整間公司共用同一位「倉庫管理員」**

### 逐行概念

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

| 段落 | 意思 |
|------|------|
| `globalForPrisma` | 把 `globalThis`（整個 Node 行程共用的全域）當成可掛 `prisma` 的物件 |
| `global... ?? new PrismaClient` | 已有實例就重用，沒有才新建 |
| `log` | development 印 SQL；其他環境多半只印 error |
| 非 production 寫回 global | 開發熱重載時下次還找得到同一個 client |

### 為什麼要掛 global？（熱重載）

`pnpm --filter server dev` 改碼 → tsup 重打包 → 模組再載入一次。

若只寫 `export const prisma = new PrismaClient()`：

1. 檔案再執行  
2. 再 `new`  
3. 再開一組連線 → 可能 `too many connections`

有 global 之後：第一次 `new` 並存起來；之後熱重載直接重用。

Production 通常不會像 watch 那樣反覆重載模組，不一定要掛 global（常見慣例是開發才掛）。

### 它「不會」做的事

| 不是做這個 | 真正誰在做 |
|------------|------------|
| 定義資料表結構 | `schema.prisma` |
| 建立／遷移資料表 | `prisma migrate`／entrypoint 的 `migrate deploy` |
| 寫業務規則 | `sessions.service`／`messages.service` |
| 聽 HTTP port | `index.ts` + Fastify |

### 生活比喻

- `schema.prisma` = 倉庫貨架配置圖  
- `PrismaClient` = 倉庫管理員（照圖找貨、放貨）  
- `lib/prisma.ts` = **只請一位管理員**；辦公室重建（熱重載）時還是同一人上班，不要每次重建都再雇新人  

---

## 8. 一句話總結

- **規格**：`schema.prisma`  
- **建表**：`db:migrate`／Docker 的 `migrate deploy`  
- **給程式用的 API**：`db:generate` → `@prisma/client`  
- **執行期連線**：`lib/prisma.ts` 單例  
