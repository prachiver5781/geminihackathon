# Hold-token verification checklist

## Automated HTTP integration checks

From the repository root, run:

```sh
python backend/hold_tokens/verify.py
```

The script starts the real HTTP handler on an ephemeral loopback port, resets
the seeded inventory and queue before each case, and requires no running
service or third-party packages. It covers exact stock deduction and two-hour
expiry, atomic conflict handling, fulfillment and duplicate rejection, FIFO
waitlist activation, closing-time caps and cutoff rejection, proxy PIN format,
receipt totals, and expiry restoration/idempotency. Expired status is inspected
in memory because the public API intentionally has no token lookup endpoint.

## Manual curl checklist

In terminal 1, start the service from the repository root:

```sh
python backend/hold_tokens/server.py
```

It listens at `http://127.0.0.1:8004` by default. In terminal 2, run these
commands in order. Each step states the expected result.

### 1. Read initial stock

```sh
curl -sS http://127.0.0.1:8004/api/tokens/inventory/PMBJK-CHD-17
```

Record `PMBJP-101` `available_qty` (seed value: `40`).

### 2. Create a two-hour hold for 3 units

```sh
curl -sS -X POST http://127.0.0.1:8004/api/tokens/hold \
  -H 'Content-Type: application/json' \
  -d '{"store_id":"PMBJK-CHD-17","items":[{"drug_code":"PMBJP-101","quantity":3}]}'
```

Expect HTTP `201`, `status: ACTIVE`, a `token_id`, `qr_payload`, payable amount
`30`, and an `expires_at` exactly 120 minutes after `created_at`.

### 3. Confirm exact stock deduction

```sh
curl -sS http://127.0.0.1:8004/api/tokens/inventory/PMBJK-CHD-17
```

Expect `PMBJP-101` `available_qty` to be the recorded initial amount minus `3`
(normally `37`).

### 4. Try a multi-item request with one insufficient line

This asks for two available units of `PMBJP-101` plus 999 units of `PMBJP-204`.

```sh
curl -i -X POST http://127.0.0.1:8004/api/tokens/hold \
  -H 'Content-Type: application/json' \
  -d '{"store_id":"PMBJK-CHD-17","items":[{"drug_code":"PMBJP-101","quantity":2},{"drug_code":"PMBJP-204","quantity":999}]}'
```

Expect HTTP `409`, an `unavailable` entry for `PMBJP-204`, and no deduction of
the two units of `PMBJP-101`. Re-read inventory to confirm the prior count is
unchanged.

### 5. Fulfill the first active token

Replace `<TOKEN_ID>` with the `token_id` returned in step 2:

```sh
curl -i -X POST http://127.0.0.1:8004/api/tokens/fulfill \
  -H 'Content-Type: application/json' \
  -d '{"token_id":"<TOKEN_ID>"}'
```

Expect HTTP `200`, `status: FULFILLED`, and a `fulfilled_at` timestamp.

### 6. Verify duplicate fulfillment is blocked

Repeat the step 5 request with the same token ID. Expect HTTP `409` and
`token_status: FULFILLED`. Fulfilled stock remains deducted for pickup.

### 7. Create a second hold to exercise expiry/release

```sh
curl -sS -X POST http://127.0.0.1:8004/api/tokens/hold \
  -H 'Content-Type: application/json' \
  -d '{"store_id":"PMBJK-CHD-17","items":[{"drug_code":"PMBJP-101","quantity":4}]}'
```

Save its token ID as `<EXPIRY_TOKEN_ID>` and note the current stock count.

### 8. Force expiry for the live demo

```sh
curl -sS -X POST http://127.0.0.1:8004/api/tokens/release-expired \
  -H 'Content-Type: application/json' \
  -d '{"force_expire_token_id":"<EXPIRY_TOKEN_ID>"}'
```

Expect `released_count: 1` and that token ID in `released_token_ids`. The API
does not expose token lookup, so the automated script asserts `EXPIRED` directly
from the process token state. Re-read inventory; `PMBJP-101` must return to the
count recorded before this second hold.

### 9. Verify expiry release cannot restore stock twice

Repeat step 8 with the same token ID. Expect `released_count: 0`, then re-read
inventory and confirm the count did not change. To verify natural expiry rather
than demo force-expiry, create a new hold, wait until its `expires_at`, and call
`POST /api/tokens/release-expired` with `{}`; it should release only expired
`ACTIVE` tokens.
