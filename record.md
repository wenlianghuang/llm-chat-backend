# 開發／除錯雜記（Docker 為主）

Prisma、`schema.prisma`、migration、`lib/prisma.ts` 等說明已移到  
→ [`record_of_prisma.md`](record_of_prisma.md)

---

# 只有 `llm-chat-db`、沒有 `llm-chat-server`：完整說明與解法

## 1. Compose 本來就有兩個服務

| Compose service | 容器名 | 角色 | Host 埠 |
|-----------------|--------|------|---------|
| `db` | `llm-chat-db` | Postgres | **5434** → 容器內 5432 |
| `server` | `llm-chat-server` | Fastify API + Swagger | **3000** |

正確的 Docker 全套應該是 **兩個都 Up**。  
只有 DB = **資料庫在，API 不在**；瀏覽器開的 `/docs`、Swagger Try it out，都必須打到 **server**，不是只靠 DB。

`server` 連 DB 的方式（在容器網路內）：

```text
DATABASE_URL=postgresql://postgres:postgres@db:5432/llm_chat
```

這裡的 `db` 是 compose 服務名，**不是** `localhost:5434`。  
`5434` 只給「本機工具 / 本機 Node」從外面連 Docker Postgres 用。

（查表、`psql`、Prisma Studio 指令見 [`record_of_prisma.md`](record_of_prisma.md) 第 5 節。）

---

## 2. 為什麼會「只有 DB」？

常見原因：

### A. 只起了 DB（最常見）

例如為了跑測試：

```bash
docker-compose up db -d
```

這**故意**只起 `db`，不會起 `server`。

### B. 本機已佔用 3000

本機 `pnpm dev` / `node` 先聽了 `3000`，再 `docker-compose up` 時，`llm-chat-server` 可能：

- 建立失敗，或  
- 立刻退出  

結果 `docker-compose ps` 只剩 `llm-chat-db`，但 `curl localhost:3000` 仍可能有回應——那是**本機 Node**，連的通常是 `.env` 裡的連線，**不一定**是這顆 Docker DB。

### C. `down` 之後沒把 server 再拉起來

`docker-compose down` 會停掉兩個容器。若之後只 `up db -d`，就又變「只有 DB」。

### D. server 崩潰後沒注意到

migrate / 環境變數出錯會讓 server 退出。要用 `logs` 查，不能只看 DB healthy。

---

## 3. 會造成什麼現象？

| 現象 | 原因 |
|------|------|
| `docker-compose ps` 只有 `llm-chat-db` | server 沒跑 |
| Docker DB 是空的（`down -v` 後） | 正常；且本機 API 可能根本沒寫進這顆 DB |
| Swagger `Failed to fetch` | 瀏覽器打不到穩定的 Docker server，或本機/容器混用、CORS/host 不一致 |
| 「找不到 session」 | 其實沒成功 POST；或寫進另一顆 DB；或 Docker DB 被 `-v` 清空 |

---

## 4. 怎麼確認（診斷）

```bash
# 1) 該有兩個
docker-compose ps

# 2) server 日誌（有無 listening / 錯誤）
docker-compose logs server --tail=50

# 3) 誰佔 3000
lsof -iTCP:3000 -sTCP:LISTEN

# 4) health
curl -s http://localhost:3000/health
```

**正常全套：**

```text
llm-chat-db       ... Up (healthy)   0.0.0.0:5434->5432/tcp
llm-chat-server   ... Up             0.0.0.0:3000->3000/tcp
```

日誌應類似：`Applying database migrations...` → `Server listening at http://0.0.0.0:3000`（或 `172.x`）。

---

## 5. 解決辦法（完整步驟）

### 步驟 1：停掉佔 3000 的本機 API

在跑 `pnpm --filter server dev` 的 terminal 按 `Ctrl+C`，或：

```bash
lsof -iTCP:3000 -sTCP:LISTEN
# 確認是 node 後再結束該行程
```

### 步驟 2：用 Compose 一次起齊

在專案根目錄：

```bash
cd /Volumes/T7_SSD/llm-chat-backend

# 確認有 apps/server/.env（LLM_PROVIDER / LLM_API_KEY 等）
docker-compose up -d --build
docker-compose ps
```

不要只跑 `up db -d`（除非你刻意「只開 DB + 本機 Node」）。

### 步驟 3：驗證是 Docker server

```bash
curl -s http://localhost:3000/health
# {"status":"ok"}

curl -s -X POST http://localhost:3000/sessions \
  -H 'content-type: application/json' \
  -d '{"title":"My First Chat"}'
```

文件請開：**`http://localhost:3000/docs`**（同一用 `localhost`，不要混 `127.0.0.1`）。

### 步驟 4：若 server 仍不起

```bash
docker-compose logs server
docker-compose up -d server   # 只重試 API
```

對照 log：port 衝突、migrate 失敗、缺 env 等。

---

## 6. 兩種合法開發模式（不要混）

| 模式 | 指令 | `:3000` 是誰 | DB |
|------|------|--------------|-----|
| **全 Docker（建議測 compose）** | `docker-compose up -d` | `llm-chat-server` | 容器內 `db:5432`（host 看 5434） |
| **本機 API + Docker DB** | `docker-compose up db -d` + `pnpm --filter server dev` | 本機 Node | `.env` 要設 `localhost:5434` |

混用症狀：以為在測 Docker，其實在打本機；Docker DB 一直是空的。

---

## 7. 和 `down -v` 的關係

```bash
docker-compose down       # 停容器，volume 還在，資料保留
docker-compose down -v    # 連 llm_chat_pgdata 一起刪 → DB 變空
```

空 DB ≠ server 沒連上；但「只有 db、沒有 server」時，你更不可能透過 Docker API 在那顆空 DB 裡建出 session。

---

## 8. 一句話總結

**`llm-chat-db` healthy 只代表資料庫在；API / Swagger / 建 session 都要靠 `llm-chat-server`。**  
先清 3000 → `docker-compose up -d --build` → `ps` 看到兩個 → 再用 `localhost:3000/docs` 測。
