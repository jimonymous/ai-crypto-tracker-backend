# Crypto Tracker Web (placeholder)

Vite/Tailwind frontend shell. Implementation is pending; use the frontend docs as the contract for building the middleware/client layer.

## Status
- Scripts are placeholders in `package.json`; Vite dev server is not wired yet.

## How to integrate (when building the web app)
- Follow `docs/FRONTEND_ENV.md` for Vite env and proxy setup (`VITE_API_BASE_URL`, `VITE_WS_URL`, chain defaults).
- Use the middleware guides: `docs/FRONTEND_MIDDLEWARE.md` and `docs/FRONTEND_MIDDLEWARE_CLIENT.md`.
- UI wiring examples live in `docs/FRONTEND_SNIPPETS.md`; testing patterns in `docs/FRONTEND_TESTS.md`.

## Next steps
- Scaffold Vite + React + Tailwind.
- Implement the typed client per `FRONTEND_MIDDLEWARE_CLIENT.md`.
- Apply proxy/env config from `FRONTEND_ENV.md`.
