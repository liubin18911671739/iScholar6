# Repository Guidelines

## Project Structure & Module Organization

The web app is a Next.js 14 App Router project: routes live in `app/`, reusable UI in `components/`, and client, server, AI, auth, and domain helpers in `lib/`. English and Chinese strings are in `messages/`; static assets are in `public/`. Frontend unit tests are under `__tests__/`, and Playwright browser tests are under `e2e/`. The FastAPI service, Alembic migrations, and backend tests live in `services/backend/`; the evaluation harness and its tests are in `services/eval/`. Database initialization is in `db/`, and deployment configuration is in the root Docker Compose files and `docker/`.

## Build, Test, and Development Commands

- `pnpm dev` starts the Next.js app for local development; `pnpm build` creates the production build.
- `pnpm lint` runs the configured Next.js lint command. `pnpm test -- --run` runs Vitest once.
- `pnpm test:e2e` runs Playwright; authenticated flows require the Compose PostgreSQL service.
- `pnpm quality-gate` runs the frontend lint, unit tests, build, and E2E suite, with backend/eval checks attempted when available.
- `pnpm docker:up` starts the full Compose stack; `pnpm docker:down` stops it. Backend Python checks can run from `services/backend/` with `uv run ruff check app tests` and `uv run pytest -q`; eval checks run similarly from `services/eval/`.

## Coding Style & Naming Conventions

Use TypeScript/TSX with strict typing and existing Next.js conventions. Keep components in PascalCase, hooks in `use-*.ts`/`use*.ts` style matching nearby files, and utilities in descriptive lowercase modules. Follow the repository's ESLint configuration; Python targets 3.12, uses Ruff with a 120-character line length, and four-space indentation. Keep API contracts aligned between `app/api/`, `lib/client/`, and backend routers/schemas. Add migrations through Alembic rather than editing deployed schema by hand.

## Testing Guidelines

Name Vitest files `*.test.ts` or `*.test.tsx` under `__tests__/`; name Playwright files `*.spec.ts` under `e2e/`. Backend and eval tests use pytest `test_*.py` in their respective `tests/` directories. Add focused regression coverage for behavior changes and run the relevant suite; run `pnpm quality-gate` for broad changes. Live model evaluation requires configured service credentials and should not be assumed by offline tests.

## Commit & Pull Request Guidelines

Recent commits use concise conventional prefixes such as `feat:`, `fix(auth):`, `chore:`, and `docs:`. Use imperative summaries and scope when useful. A pull request should explain user-visible and architectural changes, list verification commands and outcomes, link related work, and include screenshots for UI changes. Call out database migrations and required environment changes.

## Security & Configuration

Use `.env.example` as the configuration template; never commit secrets or real credentials. Preserve the signed web-to-backend identity boundary and backend authorization checks. Review privacy and audit behavior when changing training, user data, or agent persistence.
