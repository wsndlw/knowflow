# knowflow

knowflow is an AI knowledge base system scaffold for enterprise and institutional use. This P0 baseline provides the monorepo, local infrastructure, database schema, API skeleton, worker skeleton, seed script, and a Next.js shell for later feature work.

## Architecture

- `apps/web`: Next.js App Router frontend. It includes the login shell, app layout, placeholder routes, and a health page that calls the API.
- `apps/api`: NestJS backend. It includes domain module skeletons, global validation/error handling, `/health`, Redis/BullMQ wiring, and the worker entrypoint.
- `packages/shared`: Shared constants, TypeScript types, and Zod schemas used by both frontend and backend.
- `packages/db`: Drizzle schema, migrations, database client, and seed script.
- `docker-compose.yml`: Local PostgreSQL with pgvector and Redis only. Web, API, and worker processes run locally with pnpm.

## Prerequisites

- Node.js 22+
- pnpm 10+
- Docker Desktop or another Docker engine with Compose support

## Environment

Create a local environment file:

```bash
cp .env.example .env
```

Review these values before running locally:

- `DATABASE_URL`
- `REDIS_URL`
- `SEED_ADMIN_USER`
- `SEED_ADMIN_PASSWORD`
- `SESSION_SECRET`
- `MODEL_API_KEY_ENCRYPTION_KEY`

## Install

```bash
pnpm install
```

## Start Infrastructure

Docker is intentionally limited to stateful base services:

```bash
docker compose up -d postgres redis
```

PostgreSQL uses the `pgvector/pgvector:pg16` image, and migrations enable the `vector` extension. Embedding columns are defined as `vector(1024)`.

## Database

Run migrations:

```bash
pnpm db:migrate
```

Seed the bootstrap account, demo departments/users, default model provider/catalog/policies, and demo knowledge base shells:

```bash
pnpm seed
```

The seed intentionally does not create document content. Real document ingestion is handled by later tasks.

## Local Development

Run the API:

```bash
pnpm --filter @knowflow/api dev
```

Run the worker:

```bash
pnpm --filter @knowflow/api worker
```

Run the web app:

```bash
pnpm --filter @knowflow/web dev
```

Useful URLs:

- API health: `http://localhost:4000/health`
- Web app: `http://localhost:3000`

The web app proxies `/api/*` requests to `NEXT_PUBLIC_API_BASE_URL`, which defaults to `http://localhost:4000`.

## Worker Smoke Test

With Redis and the worker process running, enqueue and consume one test job:

```bash
pnpm --filter @knowflow/api queue:smoke
```

## Quality Checks

Run the same checks configured in GitHub Actions:

```bash
pnpm lint
pnpm typecheck
pnpm build
```
