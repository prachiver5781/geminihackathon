"""Standalone, deterministic hold-token API for Jan Aushadhi stock."""

from __future__ import annotations

import json
import os
import secrets
import threading
import uuid
from datetime import datetime, time, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import unquote, urlparse


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso_utc(value: datetime) -> str:
    return value.isoformat(timespec="seconds").replace("+00:00", "Z")


IST = timezone(timedelta(hours=5, minutes=30), name="IST")


# This is intentionally in-memory. Replace this object with a durable store if
# the service is deployed beyond a single-process demo.
INVENTORY: dict[str, dict[str, Any]] = {
    "PMBJK-CHD-17": {
        "store_id": "PMBJK-CHD-17",
        "name": "Jan Aushadhi Kendra, Sector 17",
        "city": "Chandigarh",
        "state": "Chandigarh",
        "address": "Sector 17, Chandigarh",
        "latitude": 30.7415,
        "longitude": 76.7821,
        "closing_hour_ist": "21:00 IST",
        "items": {
            "PMBJP-101": {"salt": "Paracetamol", "available_qty": 40, "mrp": 10.0, "branded_mrp": 35.0, "closing_hour_ist": "21:00 IST"},
            "PMBJP-204": {"salt": "Amlodipine", "available_qty": 18, "mrp": 12.5, "branded_mrp": 54.0, "closing_hour_ist": "21:00 IST"},
            "PMBJP-309": {"salt": "Metformin", "available_qty": 25, "mrp": 8.0, "branded_mrp": 32.0, "closing_hour_ist": "21:00 IST"},
        },
    },
    "PMBJK-CHD-22": {
        "store_id": "PMBJK-CHD-22",
        "name": "Jan Aushadhi Kendra, Sector 22",
        "city": "Chandigarh",
        "state": "Chandigarh",
        "address": "Sector 22, Chandigarh",
        "latitude": 30.7333,
        "longitude": 76.7720,
        "closing_hour_ist": "20:30 IST",
        "items": {
            "PMBJP-101": {"salt": "Paracetamol", "available_qty": 22, "mrp": 10.0, "branded_mrp": 35.0, "closing_hour_ist": "20:30 IST"},
            "PMBJP-204": {"salt": "Amlodipine", "available_qty": 12, "mrp": 12.5, "branded_mrp": 54.0, "closing_hour_ist": "20:30 IST"},
            "PMBJP-309": {"salt": "Metformin", "available_qty": 0, "mrp": 8.0, "branded_mrp": 32.0, "closing_hour_ist": "20:30 IST"},
        },
    },
}

REFILL_ALERTS = [
    {"days_remaining": 3, "drug_code": "PMBJP-204", "salt": "Amlodipine", "preferred_store": "PMBJK-CHD-17"},
    {"days_remaining": 5, "drug_code": "PMBJP-309", "salt": "Metformin", "preferred_store": "PMBJK-CHD-22"},
]

TOKENS: dict[str, dict[str, Any]] = {}
WAITLIST: list[dict[str, Any]] = []
LOCK = threading.RLock()


class ApiError(Exception):
    def __init__(self, status: int, message: str, **details: Any):
        self.status = status
        self.payload = {"error": message, **details}


def _public_store(store: dict[str, Any]) -> dict[str, Any]:
    return {
        **{key: value for key, value in store.items() if key != "items"},
        "items": [
            {"drug_code": code, **item}
            for code, item in sorted(store["items"].items())
        ],
    }


def inventory_for(store_id: str) -> dict[str, Any]:
    with LOCK:
        store = INVENTORY.get(store_id)
        if store is None:
            raise ApiError(404, "Store not found", store_id=store_id)
        return _public_store(store)


def _expiry_for_store(store: dict[str, Any], now: datetime) -> tuple[datetime, bool]:
    closing_text = store["closing_hour_ist"].replace(" IST", "")
    closing_time = time.fromisoformat(closing_text)
    local_now = now.astimezone(IST)
    closing = local_now.replace(hour=closing_time.hour, minute=closing_time.minute, second=0, microsecond=0)
    if closing <= local_now:
        closing += timedelta(days=1)
    cutoff = closing - timedelta(minutes=15)
    if cutoff <= local_now:
        raise ApiError(409, "Store closing cutoff has passed; a 15-minute pickup window is no longer available", closing_warning=True)
    requested_expiry = now + timedelta(minutes=120)
    cutoff_utc = cutoff.astimezone(timezone.utc)
    if cutoff_utc < requested_expiry:
        return cutoff_utc, True
    return requested_expiry, False


def _make_token_locked(store_id: str, requested: dict[str, int], patient_name: str | None, now: datetime) -> dict[str, Any]:
    """Deduct validated stock and create the common ACTIVE token record."""
    store = INVENTORY[store_id]
    expires, closing_warning = _expiry_for_store(store, now)
    token_id = str(uuid.uuid4())
    proxy_pin = f"{secrets.randbelow(10000):04d}"
    reserved = []
    total = 0.0
    for code, quantity in requested.items():
        stock = store["items"][code]
        stock["available_qty"] -= quantity
        line_total = round(stock["mrp"] * quantity, 2)
        total += line_total
        reserved.append({
            "drug_code": code,
            "salt": stock["salt"],
            "quantity": quantity,
            "mrp": stock["mrp"],
            "branded_mrp": stock["branded_mrp"],
            "line_total_inr": line_total,
        })
    token = {
        "token_id": token_id,
        "store_id": store_id,
        "status": "ACTIVE",
        "items": reserved,
        "created_at": iso_utc(now),
        "expires_at": iso_utc(expires),
        "total_payable_inr": round(total, 2),
        "closing_warning": closing_warning,
        "proxy_pin": proxy_pin,
    }
    if patient_name is not None:
        token["patient_name"] = patient_name
    qr_payload = json.dumps(
        {"token_id": token_id, "store_id": store_id, "proxy_pin": proxy_pin},
        separators=(",", ":"),
    )
    token["qr_payload"] = qr_payload
    TOKENS[token_id] = token
    return token


def create_hold(body: Any) -> dict[str, Any]:
    if not isinstance(body, dict):
        raise ApiError(400, "Request body must be a JSON object")
    store_id = body.get("store_id")
    patient_name = body.get("patient_name")
    lines = body.get("items")
    if not isinstance(store_id, str) or not isinstance(lines, list) or not lines:
        raise ApiError(400, "store_id and a non-empty items array are required")
    if patient_name is not None and (not isinstance(patient_name, str) or not patient_name.strip()):
        raise ApiError(400, "patient_name must be a non-empty string when provided")

    # Consolidate duplicate drug codes so the whole request is checked and
    # reserved as one quantity per code.
    requested: dict[str, int] = {}
    for line in lines:
        if not isinstance(line, dict) or not isinstance(line.get("drug_code"), str):
            raise ApiError(400, "Each item must include a string drug_code")
        # `qty` is the action-tool schema field. `quantity` remains accepted for
        # the existing React module and older clients.
        quantity = line.get("qty", line.get("quantity"))
        if isinstance(quantity, bool) or not isinstance(quantity, int) or quantity <= 0:
            raise ApiError(400, "Each item quantity must be a positive integer")
        requested[line["drug_code"]] = requested.get(line["drug_code"], 0) + quantity

    with LOCK:
        store = INVENTORY.get(store_id)
        if store is None:
            raise ApiError(404, "Store not found", store_id=store_id)

        unavailable = []
        for code, quantity in requested.items():
            stock = store["items"].get(code)
            if stock is None or stock["available_qty"] < quantity:
                unavailable.append({
                    "drug_code": code,
                    "requested_qty": quantity,
                    "available_qty": stock["available_qty"] if stock else 0,
                })
        if unavailable:
            raise ApiError(409, "Insufficient stock; no quantities were reserved", unavailable=unavailable)

        # Validate the closing window before mutating inventory.
        now = now_utc()
        _expiry_for_store(store, now)  # fail before stock deduction if cutoff passed
        return dict(_make_token_locked(store_id, requested, patient_name.strip() if patient_name else None, now))


def join_waitlist(body: Any) -> dict[str, Any]:
    if not isinstance(body, dict):
        raise ApiError(400, "Request body must be a JSON object")
    store_id = body.get("store_id")
    drug_code = body.get("drug_code")
    quantity = body.get("qty", body.get("quantity"))
    patient_name = body.get("patient_name")
    if not isinstance(store_id, str) or not isinstance(drug_code, str):
        raise ApiError(400, "store_id and drug_code are required")
    if isinstance(quantity, bool) or not isinstance(quantity, int) or quantity <= 0:
        raise ApiError(400, "qty must be a positive integer")
    if patient_name is not None and (not isinstance(patient_name, str) or not patient_name.strip()):
        raise ApiError(400, "patient_name must be a non-empty string when provided")
    with LOCK:
        store = INVENTORY.get(store_id)
        if store is None:
            raise ApiError(404, "Store not found", store_id=store_id)
        stock = store["items"].get(drug_code)
        if stock is None:
            raise ApiError(404, "Drug code not found at this store", drug_code=drug_code)
        if stock["available_qty"] > 0:
            raise ApiError(409, "Stock is currently available; use the hold endpoint", available_qty=stock["available_qty"])
        entry = {
            "waitlist_id": str(uuid.uuid4()),
            "store_id": store_id,
            "drug_code": drug_code,
            "salt": stock["salt"],
            "qty": quantity,
            "status": "WAITING",
            "created_at": iso_utc(now_utc()),
        }
        if patient_name:
            entry["patient_name"] = patient_name.strip()
        WAITLIST.append(entry)
        entry["position"] = sum(
            1 for queued in WAITLIST
            if queued["store_id"] == store_id and queued["drug_code"] == drug_code and queued["status"] == "WAITING"
        )
        return dict(entry)


def waitlist_status(waitlist_id: str) -> dict[str, Any]:
    with LOCK:
        for entry in WAITLIST:
            if entry["waitlist_id"] == waitlist_id:
                return dict(entry)
    raise ApiError(404, "Waitlist entry not found", waitlist_id=waitlist_id)


def _activate_waitlist_locked(store_id: str, drug_code: str, now: datetime) -> list[dict[str, Any]]:
    activated = []
    stock = INVENTORY[store_id]["items"][drug_code]
    while stock["available_qty"] > 0:
        head = next((entry for entry in WAITLIST if entry["store_id"] == store_id and entry["drug_code"] == drug_code and entry["status"] == "WAITING"), None)
        if head is None or head["qty"] > stock["available_qty"]:
            break  # strict FIFO: a later smaller request cannot jump the queue
        try:
            token = _make_token_locked(store_id, {drug_code: head["qty"]}, head.get("patient_name"), now)
        except ApiError:
            break  # keep stock and queue untouched when the closing cutoff passed
        head["status"] = "RESERVED"
        head["reserved_at"] = iso_utc(now)
        head["token_id"] = token["token_id"]
        head["token"] = dict(token)
        activated.append({"waitlist_id": head["waitlist_id"], "token": dict(token)})
    for position, entry in enumerate((entry for entry in WAITLIST if entry["store_id"] == store_id and entry["drug_code"] == drug_code and entry["status"] == "WAITING"), 1):
        entry["position"] = position
    return activated


def fulfill(body: Any) -> dict[str, Any]:
    token_id = body.get("token_id") if isinstance(body, dict) else None
    if not isinstance(token_id, str) or not token_id:
        raise ApiError(400, "token_id is required")
    with LOCK:
        token = TOKENS.get(token_id)
        if token is None:
            raise ApiError(404, "Token not found", token_id=token_id)
        if token["status"] != "ACTIVE":
            raise ApiError(409, "Only ACTIVE tokens can be fulfilled", token_status=token["status"])
        token["status"] = "FULFILLED"
        token["fulfilled_at"] = iso_utc(now_utc())
        receipt_items = []
        branded_total = 0.0
        for item in token["items"]:
            brand_line = round(item["branded_mrp"] * item["quantity"], 2)
            paid_line = round(item["mrp"] * item["quantity"], 2)
            branded_total += brand_line
            receipt_items.append({
                **item,
                "branded_equivalent_line_total": brand_line,
                "jan_aushadhi_paid_line": paid_line,
                "saved_line_inr": round(brand_line - paid_line, 2),
            })
        receipt = {
            "items": receipt_items,
            "branded_equivalent_total": round(branded_total, 2),
            "jan_aushadhi_paid": token["total_payable_inr"],
            "total_saved_inr": round(branded_total - token["total_payable_inr"], 2),
            "benchmark_note": "Illustrative seeded branded MRP benchmark; replace with verified local comparator prices before production use.",
        }
        token["receipt"] = receipt
        return dict(token)


def release_expired(body: Any) -> dict[str, Any]:
    if body is not None and not isinstance(body, dict):
        raise ApiError(400, "Request body must be a JSON object")
    force_id = body.get("force_expire_token_id") if body else None
    if force_id is not None and (not isinstance(force_id, str) or not force_id):
        raise ApiError(400, "force_expire_token_id must be a non-empty string")
    now = now_utc()
    released = []
    activated_waitlist = []
    with LOCK:
        for token in list(TOKENS.values()):
            forced = force_id is not None and token["token_id"] == force_id
            expired = datetime.fromisoformat(token["expires_at"].replace("Z", "+00:00")) <= now
            if token["status"] != "ACTIVE" or not (forced or expired):
                continue
            store = INVENTORY[token["store_id"]]
            for line in token["items"]:
                code = line["drug_code"]
                store["items"][code]["available_qty"] += line["quantity"]
                activated_waitlist.extend(_activate_waitlist_locked(token["store_id"], code, now))
            token["status"] = "EXPIRED"
            token["expired_at"] = iso_utc(now)
            released.append(token["token_id"])
    return {"released_count": len(released), "released_token_ids": released, "activated_waitlist": activated_waitlist}


class Handler(BaseHTTPRequestHandler):
    server_version = "HoldTokens/1.0"

    def _send(self, status: int, payload: Any) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _body(self) -> Any:
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0:
                return None
            return json.loads(self.rfile.read(length))
        except (ValueError, json.JSONDecodeError):
            raise ApiError(400, "Request body must contain valid JSON")

    def _route(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        try:
            if self.command == "GET" and path.startswith("/api/tokens/inventory/"):
                store_id = unquote(path.removeprefix("/api/tokens/inventory/"))
                if not store_id or "/" in store_id:
                    raise ApiError(404, "Store not found")
                self._send(200, inventory_for(store_id))
            elif self.command == "GET" and path == "/api/tokens/refill-alerts":
                self._send(200, {"alerts": REFILL_ALERTS})
            elif self.command == "GET" and path.startswith("/api/tokens/waitlist/"):
                waitlist_id = unquote(path.removeprefix("/api/tokens/waitlist/"))
                self._send(200, waitlist_status(waitlist_id))
            elif self.command == "POST" and path == "/api/tokens/hold":
                self._send(201, create_hold(self._body()))
            elif self.command == "POST" and path == "/api/tokens/waitlist":
                self._send(201, join_waitlist(self._body()))
            elif self.command == "POST" and path == "/api/tokens/fulfill":
                self._send(200, fulfill(self._body()))
            elif self.command == "POST" and path == "/api/tokens/release-expired":
                self._send(200, release_expired(self._body()))
            else:
                self._send(404, {"error": "Not found"})
        except ApiError as exc:
            self._send(exc.status, exc.payload)

    do_GET = _route
    do_POST = _route

    def log_message(self, fmt: str, *args: Any) -> None:
        print("%s - %s" % (self.address_string(), fmt % args))


def main() -> None:
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8004"))
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"Hold-token API listening at http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
