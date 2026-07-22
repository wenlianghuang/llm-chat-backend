# API Documentation

Interactive OpenAPI UI (Swagger) is available when the server is running:

- **Swagger UI:** http://localhost:3000/docs
- **OpenAPI JSON:** http://localhost:3000/docs/json

This file is a static reference that mirrors the same contract.

## Base URL

```text
http://localhost:3000
```

Authentication is **not** required.

## Endpoints

### Health

#### `GET /health`

Liveness check.

**Response `200`**

```json
{ "status": "ok" }
```

---

### Sessions

#### `POST /sessions`

Create a conversation session.

**Body** (optional)

| Field   | Type     | Required | Notes                |
| ------- | -------- | -------- | -------------------- |
| `title` | `string` | no       | 1–200 characters     |

**Response `201`**

```json
{
  "id": "cmrt...",
  "title": "My first chat",
  "createdAt": "2026-07-20T12:00:00.000Z",
  "updatedAt": "2026-07-20T12:00:00.000Z"
}
```

#### `GET /sessions`

List sessions, newest `updatedAt` first.

**Response `200`:** array of session objects (same shape as above).

#### `GET /sessions/:id`

Get one session.

| Status | Meaning            |
| ------ | ------------------ |
| `200`  | Session found      |
| `404`  | Session not found  |

#### `DELETE /sessions/:id`

Delete a session and all of its messages (cascade).

| Status | Meaning            |
| ------ | ------------------ |
| `204`  | Deleted            |
| `404`  | Session not found  |

---

### Messages

#### `GET /sessions/:id/messages`

List message history for a session (oldest first).

**Response `200`**

```json
[
  {
    "id": "cmrt...",
    "sessionId": "cmrt...",
    "role": "USER",
    "content": "Hello!",
    "createdAt": "2026-07-20T12:00:00.000Z"
  },
  {
    "id": "cmrt...",
    "sessionId": "cmrt...",
    "role": "ASSISTANT",
    "content": "Hi there!",
    "createdAt": "2026-07-20T12:00:01.000Z"
  }
]
```

`role` is one of: `USER` | `ASSISTANT` | `SYSTEM`.

#### `POST /sessions/:id/messages`

Send a user message and receive an LLM reply. The server:

1. Loads prior messages as context
2. Calls the configured LLM provider
3. Persists both the user and assistant messages

**Body**

| Field     | Type     | Required | Notes             |
| --------- | -------- | -------- | ----------------- |
| `content` | `string` | yes      | 1–8000 characters |

**Response `201`**

```json
{
  "userMessage": {
    "id": "...",
    "sessionId": "...",
    "role": "USER",
    "content": "Hello!",
    "createdAt": "..."
  },
  "assistantMessage": {
    "id": "...",
    "sessionId": "...",
    "role": "ASSISTANT",
    "content": "...",
    "createdAt": "..."
  }
}
```

| Status | Meaning                                      |
| ------ | -------------------------------------------- |
| `201`  | Messages created                             |
| `400`  | Validation error                             |
| `404`  | Session not found                            |
| `429`  | LLM provider rate-limited                    |
| `502`  | LLM provider failure / empty response        |

---

## Error shape

```json
{
  "error": "NotFoundError",
  "message": "Session not found: ..."
}
```

## Example curl flow

```bash
curl -s http://localhost:3000/health

SESSION=$(curl -s -X POST http://localhost:3000/sessions \
  -H 'content-type: application/json' \
  -d '{"title":"Demo"}')
SID=$(node -e "console.log(JSON.parse(process.argv[1]).id)" "$SESSION")

curl -s -X POST "http://localhost:3000/sessions/$SID/messages" \
  -H 'content-type: application/json' \
  -d '{"content":"Hello!"}'

curl -s "http://localhost:3000/sessions/$SID/messages"
```
