"""HTTP integration checks for the hold-token service (standard library only).

Run from the repository root with: python backend/hold_tokens/verify.py
The service is hosted on an ephemeral loopback port; no external server is needed.
"""

from __future__ import annotations

import copy
import http.client
import json
import threading
import unittest
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer

import server as hold_tokens


BASE_INVENTORY = copy.deepcopy(hold_tokens.INVENTORY)


class HoldTokenHttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), hold_tokens.Handler)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.httpd.server_address[1]

    @classmethod
    def tearDownClass(cls) -> None:
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=2)

    def setUp(self) -> None:
        with hold_tokens.LOCK:
            hold_tokens.INVENTORY.clear()
            hold_tokens.INVENTORY.update(copy.deepcopy(BASE_INVENTORY))
            hold_tokens.TOKENS.clear()
            hold_tokens.WAITLIST.clear()

    def request(self, method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=3)
        encoded = None if body is None else json.dumps(body)
        headers = {"Content-Type": "application/json"} if encoded is not None else {}
        connection.request(method, path, body=encoded, headers=headers)
        response = connection.getresponse()
        result = response.status, json.loads(response.read().decode("utf-8"))
        connection.close()
        return result

    def stock(self, store_id: str, drug_code: str) -> int:
        status, payload = self.request("GET", f"/api/tokens/inventory/{store_id}")
        self.assertEqual(status, 200)
        return next(item["available_qty"] for item in payload["items"] if item["drug_code"] == drug_code)

    def create(self, quantity: int, store_id: str = "PMBJK-CHD-17", drug_code: str = "PMBJP-101") -> tuple[int, dict]:
        from unittest.mock import patch

        stable_off_peak = datetime(2026, 11, 27, 6, 0, tzinfo=timezone.utc)
        with patch.object(hold_tokens, "now_utc", return_value=stable_off_peak):
            return self.request("POST", "/api/tokens/hold", {
                "store_id": store_id,
                "items": [{"drug_code": drug_code, "quantity": quantity}],
            })

    def test_hold_deducts_exact_quantity_and_expires_in_120_minutes(self) -> None:
        before = self.stock("PMBJK-CHD-17", "PMBJP-101")
        status, token = self.create(3)

        self.assertEqual(status, 201)
        self.assertEqual(self.stock("PMBJK-CHD-17", "PMBJP-101"), before - 3)
        self.assertEqual(token["status"], "ACTIVE")
        self.assertEqual(token["items"][0]["quantity"], 3)
        self.assertEqual(token["total_payable_inr"], 30.0)
        self.assertTrue(token["qr_payload"])
        created = datetime.fromisoformat(token["created_at"].replace("Z", "+00:00"))
        expires = datetime.fromisoformat(token["expires_at"].replace("Z", "+00:00"))
        self.assertEqual((expires - created).total_seconds(), 120 * 60)

    def test_action_tool_schema_fields_patient_name_and_qty_are_accepted(self) -> None:
        from unittest.mock import patch

        with patch.object(hold_tokens, "now_utc", return_value=datetime(2026, 11, 27, 6, 0, tzinfo=timezone.utc)):
            status, token = self.request("POST", "/api/tokens/hold", {
                "patient_name": "Asha",
                "store_id": "PMBJK-CHD-17",
                "items": [{"drug_code": "PMBJP-101", "qty": 2}],
            })
        self.assertEqual(status, 201)
        self.assertEqual(token["patient_name"], "Asha")
        self.assertEqual(token["items"][0]["quantity"], 2)
        self.assertEqual(len(token["proxy_pin"]), 4)
        self.assertTrue(token["proxy_pin"].isdigit())
        self.assertEqual(json.loads(token["qr_payload"])["proxy_pin"], token["proxy_pin"])

    def test_closing_time_caps_expiry_and_sets_warning(self) -> None:
        from unittest.mock import patch

        # 20:00 IST at the 21:00-closing store leaves 45 minutes to its cutoff.
        fixed_now = datetime(2026, 11, 27, 14, 30, tzinfo=timezone.utc)
        with patch.object(hold_tokens, "now_utc", return_value=fixed_now):
            status, token = self.request("POST", "/api/tokens/hold", {
                "store_id": "PMBJK-CHD-17",
                "items": [{"drug_code": "PMBJP-101", "quantity": 1}],
            })
        self.assertEqual(status, 201)
        self.assertTrue(token["closing_warning"])
        expires = datetime.fromisoformat(token["expires_at"].replace("Z", "+00:00"))
        self.assertEqual((expires - fixed_now).total_seconds(), 45 * 60)

    def test_closing_cutoff_rejects_hold_without_deducting_stock(self) -> None:
        from unittest.mock import patch

        before = self.stock("PMBJK-CHD-17", "PMBJP-101")
        # 20:50 IST is after the 20:45 reservation cutoff.
        fixed_now = datetime(2026, 11, 27, 15, 20, tzinfo=timezone.utc)
        with patch.object(hold_tokens, "now_utc", return_value=fixed_now):
            status, payload = self.request("POST", "/api/tokens/hold", {
                "store_id": "PMBJK-CHD-17",
                "items": [{"drug_code": "PMBJP-101", "quantity": 1}],
            })
        self.assertEqual(status, 409)
        self.assertTrue(payload["closing_warning"])
        self.assertEqual(self.stock("PMBJK-CHD-17", "PMBJP-101"), before)

    def test_insufficient_stock_is_409_and_does_not_change_any_line(self) -> None:
        from unittest.mock import patch

        before = self.stock("PMBJK-CHD-17", "PMBJP-101")
        with patch.object(hold_tokens, "now_utc", return_value=datetime(2026, 11, 27, 6, 0, tzinfo=timezone.utc)):
            status, payload = self.request("POST", "/api/tokens/hold", {
                "store_id": "PMBJK-CHD-17",
                "items": [
                    {"drug_code": "PMBJP-101", "quantity": 2},
                    {"drug_code": "PMBJP-204", "quantity": 999},
                ],
            })

        self.assertEqual(status, 409)
        self.assertIn("unavailable", payload)
        self.assertEqual(self.stock("PMBJK-CHD-17", "PMBJP-101"), before)
        self.assertEqual(hold_tokens.TOKENS, {})

    def test_fulfillment_changes_status_and_duplicate_fulfillment_is_409(self) -> None:
        status, token = self.create(2)
        self.assertEqual(status, 201)

        status, fulfilled = self.request("POST", "/api/tokens/fulfill", {"token_id": token["token_id"]})
        self.assertEqual(status, 200)
        self.assertEqual(fulfilled["status"], "FULFILLED")
        self.assertTrue(fulfilled.get("fulfilled_at"))
        self.assertEqual(hold_tokens.TOKENS[token["token_id"]]["status"], "FULFILLED")
        self.assertEqual(fulfilled["receipt"]["branded_equivalent_total"], 70.0)
        self.assertEqual(fulfilled["receipt"]["jan_aushadhi_paid"], 20.0)
        self.assertEqual(fulfilled["receipt"]["total_saved_inr"], 50.0)
        self.assertEqual(fulfilled["receipt"]["items"][0]["saved_line_inr"], 50.0)

        status, payload = self.request("POST", "/api/tokens/fulfill", {"token_id": token["token_id"]})
        self.assertEqual(status, 409)
        self.assertEqual(payload["token_status"], "FULFILLED")

    def test_force_expiry_marks_expired_restores_stock_and_is_idempotent(self) -> None:
        before = self.stock("PMBJK-CHD-17", "PMBJP-101")
        status, token = self.create(4)
        self.assertEqual(status, 201)
        self.assertEqual(self.stock("PMBJK-CHD-17", "PMBJP-101"), before - 4)

        status, released = self.request("POST", "/api/tokens/release-expired", {
            "force_expire_token_id": token["token_id"],
        })
        self.assertEqual(status, 200)
        self.assertEqual(released["released_count"], 1)
        self.assertIn(token["token_id"], released["released_token_ids"])
        self.assertEqual(hold_tokens.TOKENS[token["token_id"]]["status"], "EXPIRED")
        self.assertTrue(hold_tokens.TOKENS[token["token_id"]].get("expired_at"))
        self.assertEqual(self.stock("PMBJK-CHD-17", "PMBJP-101"), before)

        status, repeated = self.request("POST", "/api/tokens/release-expired", {
            "force_expire_token_id": token["token_id"],
        })
        self.assertEqual(status, 200)
        self.assertEqual(repeated["released_count"], 0)
        self.assertEqual(self.stock("PMBJK-CHD-17", "PMBJP-101"), before)

    def test_release_activates_waitlist_in_fifo_order(self) -> None:
        with hold_tokens.LOCK:
            hold_tokens.INVENTORY["PMBJK-CHD-22"]["items"]["PMBJP-309"]["available_qty"] = 2
        status, held = self.create(2, "PMBJK-CHD-22", "PMBJP-309")
        self.assertEqual(status, 201)
        first_status, first = self.request("POST", "/api/tokens/waitlist", {
            "store_id": "PMBJK-CHD-22", "drug_code": "PMBJP-309", "qty": 1,
        })
        second_status, second = self.request("POST", "/api/tokens/waitlist", {
            "store_id": "PMBJK-CHD-22", "drug_code": "PMBJP-309", "qty": 1,
        })
        self.assertEqual((first_status, second_status), (201, 201))
        self.assertEqual((first["position"], second["position"]), (1, 2))

        status, released = self.request("POST", "/api/tokens/release-expired", {
            "force_expire_token_id": held["token_id"],
        })
        self.assertEqual(status, 200)
        activated_ids = [entry["waitlist_id"] for entry in released["activated_waitlist"]]
        self.assertEqual(activated_ids, [first["waitlist_id"], second["waitlist_id"]])
        self.assertTrue(all(entry["token"]["status"] == "ACTIVE" for entry in released["activated_waitlist"]))
        self.assertEqual(self.stock("PMBJK-CHD-22", "PMBJP-309"), 0)
        first_status, first_latest = self.request("GET", f"/api/tokens/waitlist/{first['waitlist_id']}")
        self.assertEqual(first_status, 200)
        self.assertEqual(first_latest["status"], "RESERVED")

    def test_fifo_waitlist_does_not_skip_a_head_request_that_needs_more_stock(self) -> None:
        with hold_tokens.LOCK:
            hold_tokens.INVENTORY["PMBJK-CHD-22"]["items"]["PMBJP-309"]["available_qty"] = 1
        status, held = self.create(1, "PMBJK-CHD-22", "PMBJP-309")
        self.assertEqual(status, 201)
        _, first = self.request("POST", "/api/tokens/waitlist", {
            "store_id": "PMBJK-CHD-22", "drug_code": "PMBJP-309", "qty": 2,
        })
        _, second = self.request("POST", "/api/tokens/waitlist", {
            "store_id": "PMBJK-CHD-22", "drug_code": "PMBJP-309", "qty": 1,
        })
        status, released = self.request("POST", "/api/tokens/release-expired", {
            "force_expire_token_id": held["token_id"],
        })
        self.assertEqual(status, 200)
        self.assertEqual(released["activated_waitlist"], [])
        self.assertEqual(self.stock("PMBJK-CHD-22", "PMBJP-309"), 1)
        self.assertEqual(hold_tokens.WAITLIST[0]["waitlist_id"], first["waitlist_id"])
        self.assertEqual(hold_tokens.WAITLIST[1]["waitlist_id"], second["waitlist_id"])
        self.assertEqual([entry["status"] for entry in hold_tokens.WAITLIST], ["WAITING", "WAITING"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
