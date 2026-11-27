"""Local smoke verification for the voice command and ops API."""
import sys
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.salt_engine.api import app

client = TestClient(app)


class VoiceOpsVerification(unittest.TestCase):
    def test_supported_english_hindi_and_hinglish_commands(self):
        commands = (
            ("Scan my prescription", "en-IN", "SCAN_PRESCRIPTION"),
            ("Compare generic salts", "en-IN", "COMPARE_SALTS"),
            ("Find the nearest Kendra", "en-IN", "FIND_KENDRA"),
            ("Reserve a pickup token", "en-IN", "RESERVE_TOKEN"),
            ("Start navigation to the Kendra", "en-IN", "START_NAVIGATION"),
            ("Read the audio guide", "en-IN", "READ_AUDIO_GUIDE"),
            ("पर्ची स्कैन करो", "hi-IN", "SCAN_PRESCRIPTION"),
            ("जेनेरिक सॉल्ट की तुलना", "hi-IN", "COMPARE_SALTS"),
            ("नज़दीकी जन औषधि केंद्र", "hi-IN", "FIND_KENDRA"),
            ("टोकन बुक करो", "hi-IN", "RESERVE_TOKEN"),
            ("केंद्र का रास्ता दिखाओ", "hi-IN", "START_NAVIGATION"),
            ("ऑडियो गाइड सुनाओ", "hi-IN", "READ_AUDIO_GUIDE"),
            ("salts ki tulna", "en-IN", "COMPARE_SALTS"),
            ("token book karo", "en-IN", "RESERVE_TOKEN"),
        )
        for transcript, language, expected in commands:
            with self.subTest(transcript=transcript):
                response = client.post(
                    "/api/voice/intent",
                    json={"transcript": transcript, "language": language},
                )
                self.assertEqual(response.status_code, 200)
                result = response.json()
                self.assertEqual(result["intent"], expected)
                self.assertTrue(result["audio_text"])

    def test_hindi_audio_summary_includes_context(self):
        response = client.post(
            "/api/voice/intent",
            json={
                "transcript": "टोकन बुक करो",
                "language": "hi-IN",
                "context_summary": {
                    "savings_inr": 125,
                    "nearest_kendra": "Model Town",
                    "medicine_count": 2,
                },
            },
        )
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(result["intent"], "RESERVE_TOKEN")
        self.assertIn("₹125", result["audio_text"])
        self.assertIn("Model Town", result["audio_text"])

    def test_ambiguous_or_empty_command_is_not_guessed(self):
        for transcript in ("", "noise noise", "find kendra and book token"):
            with self.subTest(transcript=transcript):
                response = client.post(
                    "/api/voice/intent",
                    json={"transcript": transcript, "language": "en-IN"},
                )
                self.assertEqual(response.status_code, 200)
                result = response.json()
                self.assertEqual(result["intent"], "UNKNOWN_INTENT")
                self.assertEqual(result["confidence"], 0.0)
                self.assertTrue(result["suggested_commands"])

    def test_operator_summary(self):
        response = client.get(
            "/api/ops/summary",
            params={"role": "operator", "kendra_id": "PMBJK_01"},
        )
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(result["role"], "operator")
        self.assertGreater(result["pickups_today"], 0)
        self.assertTrue(result["hold_tokens"])
        self.assertTrue(result["low_stock_alerts"])
        self.assertTrue(all(token["expires_in_seconds"] > 0 for token in result["hold_tokens"]))

    def test_nodal_summary(self):
        response = client.get(
            "/api/ops/summary",
            params={"role": "nodal", "district": "Ludhiana"},
        )
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(result["role"], "nodal")
        self.assertTrue(result["top_demanded_generic_salts"])
        self.assertGreater(result["stockout_count"], 0)
        self.assertIn("active_kendras", result["coverage"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
