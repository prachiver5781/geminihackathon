# Kendra Routing API

FastAPI REST service for seeded Jan Aushadhi Kendra inventory near Ludhiana. Inventory and opening hours are illustrative demo data (`data_source: seeded_demo_inventory`, `is_mock: true`), not live store data. The API does not provide medical advice.

## Run

```sh
cd backend/kendra_routing
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

OpenAPI schema and interactive docs are available at `http://127.0.0.1:8001/openapi.json` and `/docs`.

## Endpoints

- `GET /health`
- `POST /api/kendra/recommend`: body has `lat`, `lng`, `medicines` (`salt_or_code`, `name`, positive `qty`) and optional ISO 8601 `current_time_iso`.
- `POST /api/kendra/navigation-brief`: body has `lat`, `lng`, `target_kendra_id`, and optional `voice_mode`.

Recommendation includes the best full single-store option (or partial fallback), each store's available/missing items, and a split plan. The split planner searches store combinations and visit orders, assigning each medicine to exactly one store and minimizing route distance. Every medicine appears once in a stop's `assigned_items` or once in `missing_items`. `closing_soon_warning` is true during the last 30 minutes before closing and remains true after closing; `is_open` separately indicates whether the Kendra is open now. Drive minutes are estimates; Google Maps URL opens live navigation.

## Verify

With dependencies installed, run:

```sh
pytest -q
```

Manual health and recommendation checks:

```sh
curl http://127.0.0.1:8001/health
curl -X POST http://127.0.0.1:8001/api/kendra/recommend \
  -H 'Content-Type: application/json' \
  -d '{"lat":30.9010,"lng":75.8573,"medicines":[{"salt_or_code":"METFORMIN_500","name":"Metformin 500mg","qty":2},{"salt_or_code":"ATORVASTATIN_10","name":"Atorvastatin 10mg","qty":1},{"salt_or_code":"TELMISARTAN_40","name":"Telmisartan 40mg","qty":1}],"current_time_iso":"2026-11-27T19:45:00+05:30"}'
curl -X POST http://127.0.0.1:8001/api/kendra/navigation-brief \
  -H 'Content-Type: application/json' \
  -d '{"lat":30.9010,"lng":75.8573,"target_kendra_id":"LUD-001","voice_mode":true}'
```

## Frontend

In another terminal:

```sh
cd frontend
npm install
npm run dev
```

Use Node.js 20.19 or newer with this Vite 8 scaffold. Vite serves the UI at `http://localhost:5173`. Set `VITE_KENDRA_API_URL` in `frontend/.env.local` only if the API uses another URL; the default is `http://127.0.0.1:8001`. The component accepts `onNavigateNearest`, `onRefreshKendras`, and `onNavigationBrief` props, and listens for `ronak:navigate-nearest` and `ronak:refresh-kendras` window events. After a navigation brief it emits `ronak:navigation-brief` with the brief in `event.detail`.
