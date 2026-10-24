# iScholar Desktop

PySide6 desktop frontend for the existing iScholar application. It uses the current Next.js authentication flow and BFF routes; backend service signing credentials never enter the desktop process. The FastAPI, worker, PostgreSQL, Redis, model, and MCP services stay unchanged.

## Run locally

Start the repository's web/BFF and backend services first:

```sh
pnpm docker:up
pnpm dev
```

In another terminal:

```sh
sh desktop/run.sh --base-url http://127.0.0.1:3000
```

Sign in with an existing iScholar account. The Auth.js session remains in memory for the current desktop session. The address can point to another trusted iScholar web/BFF instance.

## Build macOS app

On an Apple Silicon Mac with Python 3.12, `uv`, and network access for the first dependency install, run:

```sh
sh desktop/build-macos.sh
```

The unsigned Apple Silicon app is written to `desktop/dist/iScholar.app`. Double-click it in Finder after starting the iScholar web/BFF and backend services. The login window lets you enter the server address; it defaults to `http://127.0.0.1:3000`. You can also launch it from Terminal with `open desktop/dist/iScholar.app`.

Because this local build is unsigned, macOS may block its first launch. In Finder, Control-click `iScholar.app`, choose **Open**, then confirm **Open** in the macOS prompt. This only applies to the locally built app; distribution to other Macs requires Developer ID signing and notarization.

The app bundle contains only the desktop client and its runtime dependencies. It does not include `.env`, backend credentials, databases, or server services.

## Interface map

- **科研总览 / Dashboard:** project counts, latest runs, recent projects, and entry to project creation.
- **研究项目 / Projects:** create projects and open the project workspace.
- **Project workspace:** project attachments, manuscripts, bibliography, experiments, submissions, tasks, and the eight assistant routes.
- **Research assistants:** topic discovery modes, literature date/result limits, design, data planning, writing modes, journal matching, reviewer PDF extraction, and the multi-step research-plan approval flow.
- **Tools:** literature analysis, paper polishing, and journal selection.
- **Training:** hub, course management, analytics, reports, reviews, and certificate verification routes.
- **Settings:** interface language, connection details, and server-managed extension status.

The application keeps the existing authenticated API boundaries and records an explicit consent before starting AI runs. The desktop package does not read `.env` or embed backend secrets.
