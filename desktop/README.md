# iScholar Desktop

PySide6 desktop frontend for the existing iScholar application. It connects **directly to the FastAPI backend** (default `http://127.0.0.1:8000`) with email + password sign-in that returns a short-lived bearer access token held in memory — no Next.js/web process is required, and backend service-signing credentials never enter the desktop process. The FastAPI, worker, PostgreSQL, Redis, model, and MCP services stay unchanged.

## Run locally

The desktop client needs the backend services only. The command below is the same on macOS, Linux, and Windows (PowerShell):

```sh
docker compose up -d postgres redis backend worker
```

This starts PostgreSQL, Redis, the backend (with `migrate` running first), and the worker. The web service is not needed for desktop use.

### Run the backend on the host (hot reload)

If PostgreSQL and Redis are already running in Compose, run only the backend locally:

```sh
docker compose up -d postgres redis
cd services/backend
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Keep the terminal running, then launch the desktop app and sign in with an existing iScholar account (the same email/password used on the web). The access token stays in memory for the current desktop session; restart the app to sign in again. The address field can point to another trusted iScholar backend instance.

### Sign-in flow

1. `POST /v1/auth/login {email, password}` → `{accessToken, expiresIn, user}` (bcrypt-verifies against the shared `users` table; 10 attempts / 15 min / IP+email).
2. Every subsequent request carries `Authorization: Bearer <accessToken>`.
3. The token is a 12-hour JWT (HS256, key derived from `AGENT_SERVICE_TOKEN` server-side); it carries no role, so authorization still resolves the caller's role from the database per request.
4. Backend paths mirror the web's BFF mapping: `/api/<root>/...` → `/v1/<root>/...`.
5. Loopback addresses (`127.0.0.1`, `localhost`, `::1`) bypass `http_proxy`/`https_proxy`, so a system proxy never blocks the local backend; remote addresses still honor the proxy settings.

## Tests

Desktop unit tests are stdlib `unittest` (no extra dependencies):

```sh
cd desktop
PYTHONPATH=src python3 -m unittest discover -s tests
```

They cover path mapping, error humanization, the bearer-token login flow against a stub backend, and the loopback proxy bypass. `pnpm quality-gate` runs them as an optional step, and the Desktop builds workflow runs them on every PR.

For a live end-to-end check against a running backend with a seeded account (default `e2e-staff@ischolar.test` / `TestPass1`):

```sh
PYTHONPATH=desktop/src python3 scripts/desktop-smoke.py http://127.0.0.1:8000
```

To verify the full model path (desktop API client → local backend → official DeepSeek API → real agent output), which needs a valid `DEEPSEEK_API_KEY` in `.env` and `AGENT_MODEL_FAKE=false`, run:

```sh
PYTHONPATH=desktop/src python3 scripts/e2e-deepseek.py http://127.0.0.1:8000
```

The script creates a project, thread, and `litreview` run, waits for the worker to finish (up to 10 minutes; several DeepSeek calls plus crossref searches), and fails if the output carries the deterministic fake-model marker instead of real model text.

## Build macOS app

On an Apple Silicon Mac with Python 3.12, `uv`, and network access for the first dependency install, run:

```sh
sh desktop/build-macos.sh
```

The unsigned Apple Silicon app is written to `desktop/dist/iScholar.app`. Double-click it in Finder after starting the backend services (`docker compose up -d postgres redis backend worker`). The login window lets you enter the server address; it defaults to `http://127.0.0.1:8000`. You can also launch it from Terminal with `open desktop/dist/iScholar.app`.

Because this local build is unsigned, macOS may block its first launch. In Finder, Control-click `iScholar.app`, choose **Open**, then confirm **Open** in the macOS prompt. This only applies to the locally built app; distribution to other Macs requires Developer ID signing and notarization.

The app bundle contains only the desktop client and its runtime dependencies. It does not include `.env`, backend credentials, databases, or server services.

## CI builds and releases

GitHub Actions builds Windows x64, macOS Apple Silicon, and Linux x64 packages for every pull request and every push to `main`. Download the 30-day build from the workflow run's **Artifacts** section:

- `iScholar-windows-x64.zip` contains the Windows executable and its runtime files.
- `iScholar-macos-arm64.zip` contains `iScholar.app`.
- `iScholar-linux-x64.tar.gz` contains the Linux executable and its runtime files.

Pushing a tag such as `desktop-v0.2.0` also creates a GitHub Release with all three packages. CI packages are unsigned; macOS builds are not notarized. The app still requires a separately running iScholar backend stack (PostgreSQL, Redis, backend, worker); the web service is optional.

## Interface map

- **科研总览 / Dashboard:** project counts, latest runs, recent projects, and entry to project creation.
- **研究项目 / Projects:** create projects and open the project workspace.
- **Project workspace:** project attachments, manuscripts, bibliography, experiments, submissions, tasks, and the eight assistant routes.
- **Research assistants:** topic discovery modes, literature date/result limits, design, data planning, writing modes, journal matching, reviewer PDF extraction, and the multi-step research-plan approval flow.
- **Tools:** literature analysis, paper polishing, and journal selection.
- **Training:** hub, course management, analytics, reports, reviews, and certificate verification routes.
- **Settings:** interface language, connection details, and server-managed extension status.

The application keeps the existing authenticated API boundaries and records an explicit consent before starting AI runs. The desktop package does not read `.env` or embed backend secrets.
