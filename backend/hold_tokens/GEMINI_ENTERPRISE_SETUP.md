# Gemini Enterprise action-tool setup

This setup uses the **OpenAPI tool in CX Agent Studio**. In Google Cloud, open
the target CX Agent Studio agent, choose **Tools → Create → OpenAPI**, then paste
`openapi.yaml` from this directory into the schema editor. The spec includes
both the read-only inventory lookup and stock-changing reservation operation.
Review the preview, save the tool, and attach/enable it on the supervisor agent.
Google documents OpenAPI tools as remote APIs defined by an OpenAPI schema; the
tool is called using the tool execution identity configured in CX Agent Studio.

## Endpoint and deployment configuration

The spec has a placeholder `servers[0].url`. Replace it with the service's
reachable HTTPS origin, for example `https://hold-tokens.example.com`. Google
Cloud cannot call a developer's `localhost`; deploy the service behind a
reachable HTTPS endpoint before testing the remote action. For Cloud Run, use
the CX Agent Studio service-agent ID token configuration and grant the service
agent `roles/run.invoker` when required by the project layout. Keep the service
and tool execution identity narrowly scoped. The local demo service itself has
no authentication, so do not expose it publicly without adding an auth layer.

If the console asks for a tool-level description, use:

> Jan Aushadhi live inventory lookup and explicit stock reservation. Read the
> exact live stock and MRP for a confirmed store. Reserve only when the user has
> confirmed patient_name, store_id, and every drug_code and qty. Never infer or
> substitute medicines, stock, quantities, or prices. A 409 reserves nothing.

The operation IDs and descriptions are in the OpenAPI file:

| Operation | Tool name | Use |
| --- | --- | --- |
| `getStoreInventory` | GetStoreInventory | Read current store identity, available counts, salt names, MRP, and closing hour. |
| `reserveStoreStock` | ReserveStoreStock | Deduct explicitly confirmed quantities and create a hold of up to two hours, capped before store closing. This mutates stock. |
| `joinStockWaitlist` | JoinStockWaitlist | Join the FIFO queue for an exact out-of-stock drug at one store. |
| `getWaitlistStatus` | GetWaitlistStatus | Check whether a queue entry received an active token. |

The hold request schema requires:

```json
{
  "patient_name": "Asha",
  "store_id": "PMBJK-CHD-17",
  "items": [
    { "drug_code": "PMBJP-101", "qty": 2 }
  ]
}
```

`patient_name` is supplied by the user and attached to the reservation. The
backend also accepts the legacy `quantity` item key for the existing React
module, but the Gemini action schema intentionally exposes only `qty`.

## Supervisor instruction

Add a rule like this to the supervisor's system instructions:

> For stock questions, call GetStoreInventory only for an exact store ID the
> user selected or explicitly confirmed. If no store is confirmed, ask which
> Jan Aushadhi Kendra they want; do not choose one on their behalf. Report salt,
> available quantity, MRP, and closing hour only from the latest successful
> inventory response. Do not provide medical classification, treatment advice,
> or medicine substitutions.
>
> Reserve stock only after the user explicitly confirms their patient name,
> exact store ID, every PMBJP drug code, and each positive integer quantity. If
> any field is missing or ambiguous, ask a focused clarification and do not call
> ReserveStoreStock. Never infer a drug code from a salt name, choose an
> alternative medicine, round/guess a quantity, or claim an item or price is
> available without the inventory response.
>
> After a successful reservation, report token_id, store name (resolve from the
> inventory response for that store if needed), each reserved item and quantity,
> total_payable_inr, expires_at, proxy_pin, closing_warning, and qr_payload
> exactly as returned. Explain that the hold lasts until expires_at and may be
> shorter than two hours near closing. Share the proxy PIN only with the user's
> permission. If the hold call returns HTTP 409, state
> that nothing was reserved, relay only the returned unavailable drug codes
> and quantities, then ask the user how they want to proceed. Do not silently
> retry with fewer items or a substitute. If an API call fails or returns
> incomplete data, say the result could not be verified and do not invent it.
>
> Offer JoinStockWaitlist only when the live inventory result shows zero units
> for the exact drug code and store. Explain the queue position. Check status
> with GetWaitlistStatus when asked or while following up; if status becomes
> RESERVED, report that returned active token and its expiry. Do not promise
> when stock will be released. Report receipt savings only from the fulfilled
> token's receipt object, including its benchmark note; do not describe the
> illustrative seeded branded MRP as a verified live market quote.

For the user confirmation checkpoint, present a summary with the exact store,
patient name, PMBJP codes, salts as listed in live inventory, quantities, and
MRP-derived expected total. Ask the user to confirm that summary before calling
`reserveStoreStock`; the backend's returned `total_payable_inr` is authoritative.

## Preview checks

1. Ask for stock at a store without naming a store. The supervisor should ask
   which store, not pick one.
2. Name a store and ask for inventory. The tool result should ground every
   count and MRP in its response.
3. Ask to reserve “my usual medicines” without codes or quantities. The agent
   should clarify and must not invoke the hold action.
4. Confirm a name, store, code, and quantity, then reserve. Check that the tool
   request uses `qty`, and the success answer matches returned fields.
5. Request more than available. Confirm HTTP 409 is reported as no reservation
   and the agent does not silently reduce quantity or substitute an item.
