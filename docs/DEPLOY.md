# Deploying Ticket Board for $0

| Piece | Host | Why this one |
|---|---|---|
| `web/` | Vercel (Hobby) | Free static hosting, global CDN, detects Vite automatically |
| `api/` + `ai-service/` | Render (free web services) | Runs Docker images, supports WebSockets, no card |
| Postgres + pgvector | Supabase | pgvector built in; the free database doesn't expire |
| Redis | Upstash | Free tier (500K commands/mo), supports pub/sub |

> ⚠️ Don't use Render's free Postgres — it's deleted 30 days after creation.

Order matters: database → Redis → AI service → API → frontend, because each step
needs a URL from the one before it.

---

## 1. Supabase (Postgres + pgvector)

1. Create a project at supabase.com. Save the database password.
2. **Project Settings → Database → Connection string → "Session pooler"**. Copy it and put
   your password in. It looks like
   `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`
   - Use the **session** pooler (port **5432**), not the transaction pooler (6543):
     `prisma migrate` needs session features the transaction pooler doesn't support.
   - Not the "direct connection" either: it's IPv6-only, and Render's free tier connects over IPv4.
3. Nothing else to set up. The API runs `prisma migrate deploy` every time it starts, and the
   first migration with pgvector runs `CREATE EXTENSION IF NOT EXISTS vector`.

## 2. Upstash (Redis)

1. Create a Redis database at upstash.com (pick the region closest to your Render region).
2. Copy the **`rediss://`** URL (two s's = TLS). That's `REDIS_URL`.

## 3. Render (API + AI service)

1. Push this repo to GitHub.
2. Render dashboard → **New → Blueprint** → select the repo. It reads `render.yaml`.
3. Fill in the prompted values:
   - `ticketboard-ai` → `GEMINI_API_KEY`: optional, a free key from aistudio.google.com.
     Leave it blank to use the keyword rules.
   - `ticketboard-api` → `DATABASE_URL` (step 1), `REDIS_URL` (step 2),
     `AI_SERVICE_URL` = `https://ticketboard-ai.onrender.com` (check the real URL after it's created),
     `CORS_ORIGIN` = your frontend URL (step 4 — use a placeholder and update it after).
4. Once created, copy `AI_SERVICE_TOKEN` from the **api** service's Environment tab into the
   **ai** service's `AI_SERVICE_TOKEN`, so the API can call the AI service and nobody else can.
5. Check: `curl https://ticketboard-api.onrender.com/health` → `{"status":"ok"}`.

**Free-tier behaviour to expect:**
- Services sleep after 15 minutes idle. The first request after that takes ~30–60s.
  Before a demo, open `/health` on both services to wake them.
- 512MB RAM. ai-service uses ~400MB with the model loaded (measured in Docker). That fits,
  but not with much room. If it gets OOM-killed, see "If ai-service runs out of memory" below.

## 4. Vercel (frontend)

1. vercel.com → sign up with GitHub → **Add New… → Project** → import `ticket-board`.
2. **Root Directory:** `web` (Vercel then detects Vite: build `npm run build`, output `dist`).
3. **Environment Variables** (baked into the bundle at build time):
   - `VITE_API_URL` = `https://ticketboard-api.onrender.com`
   - `VITE_SOCKET_URL` = `https://ticketboard-api.onrender.com`
4. Deploy. `web/vercel.json` rewrites every path to `index.html`, so deep links like
   `/boards/<id>` work on refresh.
5. Back in Render, set the API's `CORS_ORIGIN` to the Vercel URL (no trailing slash) and redeploy.

## 5. Smoke test

- Register two accounts in two different browsers. Share a board from one to the other.
- Drag a ticket in one browser → it moves in the other.
- Create "Users can't log in after password reset" → within a few seconds it gets labels/priority
  and ✦ AI. Open it → similar tickets appear once there are related ones.
- Open Insights.
- `POST /graphql` with `{ me { name } }` and your token.

---

## Local full-stack run (same images as production)

```bash
docker compose --profile app up --build     # http://localhost:8080
```

## If ai-service runs out of memory

In order of effort:
1. Add `OMP_NUM_THREADS=1` and `MALLOC_ARENA_MAX=2` env vars (cuts PyTorch's thread/arena overhead).
2. Switch embeddings to an ONNX runtime (e.g. `fastembed`, same MiniLM model, no PyTorch, ~150MB).
   Only `app/embeddings.py` changes. The `Embedder` interface exists for exactly this.
