# Refreshed reviewer and Classic

The refreshed reviewer is the default page. The original React app remains at `/classic/`, with full-document links in both directions. Each page loads its own CSS entry. Classic keeps the original FastAPI `/api/analyze` response and Python score calculation; the refreshed UI uses the new SSE endpoint and includes the original score alongside its weighted 76-check score.

```text
Browser on port 4312
├── /                  refreshed React reviewer
├── /classic/          original React reviewer
├── /api/reviewer/*    Node + Playwright (public target guard)
└── /api/analyze       proxy → FastAPI on port 8000
```

## Run locally

Use Node 22 LTS or Node 24+, Python 3.10+, and Chromium's operating-system dependencies. Run each server in its own terminal. Never put provider keys in `VITE_*` variables.

```sh
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt httpx
cd frontend
npm ci
npm run browser:install
npm run build
npm start
```

Open `http://127.0.0.1:4312`. In another terminal, from `backend/`:

```sh
../.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
```

For frontend development, `npm run dev` serves both modes at `http://127.0.0.1:4311`; keep `npm run api` and FastAPI running for API proxying. Modern audit routes go to port 4312; Classic requests go to port 8000.

`REVIEWER_PORT` changes the Node server port. `CLASSIC_BACKEND_URL` sets the trusted internal FastAPI origin. The server intentionally binds loopback; a deployment should put its authenticated/restricted reverse proxy in front of it. Vite preview alone does not run capture or proxy Classic analysis.

## Runtime and data

The Node server is a required runtime component: Chromium performs a real render and measures element positions. It reuses a browser while isolating each page in a fresh context. Requests to private addresses/nonstandard ports are blocked, sample captures have no network, and service workers and WebSockets are blocked. Guarded raw HTML fallback explicitly reports that no browser screenshot was produced. Existing DNS/request guards were retained; these checks do not establish hardened Internet-facing multi-tenant isolation.

The self-contained `sample:strong` and `sample:weak` fixtures are explicitly labeled fictional pages. They run the same capture/scoring pipeline without an external website. They are never substituted for submitted live URLs. The complete audit remains useful without a model: rules produce recommendations grounded in failing checks. Set `GROQ_API_KEY` only in the Node server environment to enable optional model recommendations through Groq's supported `openai/gpt-oss-120b` with low reasoning effort and a 15-second budget. Provider failures fall back to grounded rules. Classic still reads `OPENAI_API_KEY` through its existing backend environment; no credentials were copied or required for validation.

Modern history (`reviewer:history:v1`) and saved fixes (`reviewer:fixes:v1`) remain in browser localStorage under the same origin. Switching to Classic does not clear them. Classic had no persistent storage to migrate. Changing a deployed origin requires a separate storage migration decision.

## Verify

```sh
cd frontend
npm run build
npm test
node tests/preview.mjs
cd ../backend
../.venv/bin/python test_local_contract.py
```

The browser script requires both servers and the production build. Screenshots default to `frontend/tests/artifacts/`; optionally set `REVIEWER_PREVIEW_OUTPUT` to an output directory. It checks the real fixture audit, same-origin switching, storage, mobile width, modern private-target errors and Classic backend error handling. The offline backend test replaces only its HTTP fixture response and leaves the original scoring function intact; no provider call runs.

## Deployment review still required

Ship `frontend/dist`, Node server/source/runtime dependencies, `frontend/public/reviewer/samples`, installed Chromium, and the existing FastAPI service. Run the Node server with `frontend` as its working directory so fixture paths resolve. Confirm browser executable/system dependencies, memory/concurrency limits, proxy SSE streaming and disconnect cancellation in the target host. The application has no new login, rate limit or job queue; public hosting needs a separate operational review. Live public-site compatibility, real provider output, hosted behavior and deployment were not exercised here.

## Source and licenses

The project-specific reviewer components, heuristic port, capture, score, history and small supporting atoms were selectively ported from the owner's source application. No catalog, library browsing routes, shell, local preferences or absolute source paths are included. Synthesized optional audio was removed to avoid carrying the source application's preference subsystem. Beautiful UI theme/primitives attribution and its MIT license are retained in `licenses/beautiful-ui-MIT.txt`; Craft interaction concepts are documented in CSS comments. Dependency licenses remain with their packages.
