在這個專案裡，**Fastify 是 HTTP 應用層（web framework）**：負責聽 port、接請求、驗證輸入、導向業務邏輯、回傳 JSON，以及掛 Swagger。它**不負責**資料庫（Prisma）或呼叫 LLM（`LlmClient`）。

## 在架構裡的位置

```text
Client (curl / Swagger)
        │ HTTP
        ▼
   Fastify API server   ← 你問的這層
        │
   SessionsService / MessagesService
        │
   Prisma → PostgreSQL
   LlmClient → Groq / NVIDIA / stub
```

一句話：**Fastify = 對外的 HTTP 大門與路由調度；Service = 真正的業務；Prisma / LLM = 底層依賴。**

---

## 具體做了什麼

### 1. 建立與啟動 HTTP server

`buildApp()` 建立 Fastify instance；`index.ts` 呼叫 `listen()` 綁定 port：

```21:24:apps/server/src/app.ts
export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: env.nodeEnv !== "test",
  });
```

```4:8:apps/server/src/index.ts
async function main() {
  const app = await buildApp();

  try {
    await app.listen({ port: env.port, host: env.host });
```

沒有 Fastify，你就要自己用 Node `http.createServer` 解析 method、path、body。

### 2. 註冊路由（對外 API 契約）

Route 檔把 HTTP method + path 對到 handler，handler 再呼叫 service：

| 路由 | 職責 |
|------|------|
| `GET /health` | 存活檢查 |
| `POST/GET/DELETE /sessions` | Session CRUD |
| `GET/POST /sessions/:id/messages` | 訊息列表 / 送訊並拿 LLM 回覆 |
| `GET /docs` | Swagger UI（plugin） |

例如建立 session：

```24:42:apps/server/src/modules/sessions/sessions.routes.ts
  app.post<{ Body: CreateSessionBody }>(
    "/sessions",
    {
      schema: { /* ... */ },
    },
    async (request, reply) => {
      const session = await sessionsService.create(request.body ?? {});
      return reply.code(201).send(serializeSession(session));
    },
  );
```

Fastify 負責：解析 URL / params / body → 呼叫 handler → 設 status code → 序列化 JSON。  
**不負責**：寫進 DB、叫 LLM（那是 `SessionsService` / `MessagesService`）。

### 3. Request validation（schema）

每個 route 的 `schema.body` / `schema.params` / `schema.response` 會：

1. **進站驗證** — body、params 不合規 → 自動變 validation error → 被 error handler 收成 400  
2. **文件** — 餵給 `@fastify/swagger`，在 `/docs` 產生 OpenAPI

也就是：驗證 + API 文件共用同一份 schema。

### 4. 統一錯誤處理

```44:63:apps/server/src/app.ts
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ ... });
    }
    if (error.validation) {
      return reply.code(400).send({ ... });
    }
    // ... 500
  });
```

Service 丟 `AppError`（404、429、502 等），Fastify 統一轉成 HTTP 回應，route handler 不必到處 `try/catch`。

### 5. Plugin 擴充（Swagger）

```5:34:apps/server/src/plugins/swagger.ts
export async function registerSwagger(app: FastifyInstance) {
  await app.register(swagger, { openapi: { ... } });
  await app.register(swaggerUi, { routePrefix: "/docs", ... });
}
```

Fastify 的 plugin 機制把 Swagger 掛進同一個 app；測試環境可關掉（`registerDocs: false`）。

### 6. DI 組裝與測試入口

`buildApp({ prisma, llm })` 可注入假依賴；測試用 `app.inject()` 模擬 HTTP，**不必真的 `listen` TCP**：

```text
buildApp({ llm: stub, prisma: testDb })
  → app.inject({ method: 'POST', url: '/sessions', ... })
  → 走完整 middleware / validation / route / error handler
```

這也是 README 選 Fastify 而不是手寫 Node HTTP 的原因之一。

---

## 它「不」做什麼（邊界）

| 層 | 負責者 | Fastify？ |
|----|--------|-----------|
| 聽 port、路由、驗證、JSON、Swagger | Fastify | ✅ |
| Session / Message 業務規則 | `*Service` | ❌ |
| SQL / ORM | Prisma | ❌ |
| 呼叫外部 LLM | `LlmClient` | ❌ |
| Schema / migration | Prisma | ❌ |

因此架構是：**薄的 Fastify routes + 厚的 service**。Route 幾乎只做「取 request → 叫 service → 序列化回傳」。

---

## 為什麼這裡用 Fastify

對照專案紀錄／README 的取捨：

- 比 raw `http` 少寫解析、routing、錯誤處理  
- 內建 JSON schema 驗證  
- `app.inject()` 方便 HTTP 級測試  
- Plugin 生態（這裡用 Swagger）  
- 相對 Express 偏輕、效能取向（這專案規模下主要是工程便利，不是瓶頸）

---

**總結**：Fastify 在這個後端是 **API server 骨架**——對外暴露 REST、驗證請求、掛文件、統一錯誤與測試注入；真正的聊天與持久化邏輯在它後面的 Service / Prisma / LLM 層。