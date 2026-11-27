# Jan Aushadhi Hold Tokens

Standalone, dependency-free Python service for deterministic store stock lookup,
atomic reservations, fulfillment receipts, FIFO stock-release waitlists, and
expiration release. Inventory, tokens, and queue entries are held in process
memory and reset when the process restarts; run one service process for a
consistent demo inventory.

## Run

```powershell
python backend/hold_tokens/server.py
```

The default bind is `127.0.0.1:8004`, matching the frontend module. Set `HOST`
and `PORT` to override it.
The action-tool OpenAPI document is `backend/hold_tokens/openapi.yaml`; replace
its `https://YOUR_HOST` server URL with the deployed HTTPS URL when binding it
in Gemini Enterprise.

## Example

```powershell
Invoke-RestMethod http://127.0.0.1:8004/api/tokens/inventory/PMBJK-CHD-17
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8004/api/tokens/hold `
  -ContentType 'application/json' `
  -Body '{"store_id":"PMBJK-CHD-17","items":[{"drug_code":"PMBJP-101","quantity":2}]}'
```

`POST /api/tokens/release-expired` accepts an optional
`{"force_expire_token_id":"..."}` for live demos. All stock validation and
reservation/release updates run under a single process-wide lock. An insufficient
line returns HTTP 409 with per-code availability and leaves every line intact.

Near closing, hold expiry is capped at 15 minutes before the store's IST closing
time; `closing_warning` reports the shorter window. A request inside that final
15-minute cutoff returns HTTP 409 without deducting stock. Out-of-stock requests
can join `POST /api/tokens/waitlist`; releases activate eligible requests in
strict FIFO order and include the created tokens under `activated_waitlist`.
`GET /api/tokens/waitlist/{waitlist_id}` lets clients check queue status. The
receipt's branded equivalent prices are illustrative seeded demo benchmarks,
not verified local market quotes; replace them with a documented price source
before using receipts outside a demo.
