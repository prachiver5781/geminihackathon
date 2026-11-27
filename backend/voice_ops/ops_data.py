from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List


_KENDRAS: Dict[str, Dict[str, Any]] = {
    "PMBJK_01": {
        "name": "Jan Aushadhi Kendra - Model Town",
        "district": "Ludhiana",
        "pickups_today": 38,
        "low_stock_alerts": [
            {"salt": "Amlodipine 5 mg", "available_units": 8, "reorder_level": 30},
            {"salt": "Metformin 500 mg", "available_units": 12, "reorder_level": 40},
        ],
        "hold_tokens": [
            {"token_id": "HLD-2401", "salts": ["Amlodipine 5 mg", "Atorvastatin 10 mg"], "created_at": datetime.now(timezone.utc) - timedelta(minutes=18), "status": "active"},
            {"token_id": "HLD-2402", "salts": ["Metformin 500 mg"], "created_at": datetime.now(timezone.utc) - timedelta(minutes=74), "status": "pending"},
            {"token_id": "HLD-2403", "salts": ["Cetirizine 10 mg"], "created_at": datetime.now(timezone.utc) - timedelta(minutes=126), "status": "expired"},
        ],
    },
    "PMBJK_02": {
        "name": "Jan Aushadhi Kendra - Civil Lines",
        "district": "Ludhiana",
        "pickups_today": 24,
        "low_stock_alerts": [
            {"salt": "Losartan 50 mg", "available_units": 5, "reorder_level": 25},
        ],
        "hold_tokens": [],
    },
}

_DISTRICTS: Dict[str, Dict[str, Any]] = {
    "ludhiana": {
        "top_demanded_generic_salts": [
            {"salt": "Metformin 500 mg", "requested_units": 1240},
            {"salt": "Amlodipine 5 mg", "requested_units": 890},
            {"salt": "Atorvastatin 10 mg", "requested_units": 735},
        ],
        "stockout_count": 7,
        "unmet_demand_count": 143,
        "coverage": {
            "active_kendras": 42,
            "kendras_reporting": 38,
            "total_kendras": 46,
            "coverage_percent": 91.3,
        },
    },
    "amritsar": {
        "top_demanded_generic_salts": [
            {"salt": "Paracetamol 500 mg", "requested_units": 970},
            {"salt": "Metformin 500 mg", "requested_units": 810},
            {"salt": "Amlodipine 5 mg", "requested_units": 620},
        ],
        "stockout_count": 4,
        "unmet_demand_count": 86,
        "coverage": {
            "active_kendras": 31,
            "kendras_reporting": 29,
            "total_kendras": 34,
            "coverage_percent": 91.2,
        },
    },
}


def get_ops_summary(role: str, kendra_id: str = "", district: str = "") -> Dict[str, Any]:
    generated_at = datetime.now(timezone.utc)
    if role == "operator":
        kendra = _KENDRAS.get(kendra_id)
        if kendra is None:
            return {
                "role": role,
                "kendra_id": kendra_id,
                "kendra": None,
                "hold_tokens": [],
                "pickups_today": 0,
                "low_stock_alerts": [],
                "generated_at": generated_at.isoformat(),
            }
        tokens: List[Dict[str, Any]] = []
        for token in kendra["hold_tokens"]:
            remaining = int((token["created_at"] + timedelta(hours=2) - generated_at).total_seconds())
            if remaining <= 0 or token["status"] not in {"active", "pending"}:
                continue
            tokens.append(
                {
                    "token_id": token["token_id"],
                    "salts": list(token["salts"]),
                    "expires_in_seconds": remaining,
                    "status": token["status"],
                }
            )
        return {
            "role": role,
            "kendra_id": kendra_id,
            "kendra": kendra["name"],
            "hold_tokens": tokens,
            "pickups_today": kendra["pickups_today"],
            "low_stock_alerts": list(kendra["low_stock_alerts"]),
            "generated_at": generated_at.isoformat(),
        }

    if role == "nodal":
        data = _DISTRICTS.get(district.casefold())
        return {
            "role": role,
            "district": district,
            "top_demanded_generic_salts": data["top_demanded_generic_salts"] if data else [],
            "stockout_count": data["stockout_count"] if data else 0,
            "unmet_demand_count": data["unmet_demand_count"] if data else 0,
            "coverage": data["coverage"] if data else {
                "active_kendras": 0,
                "kendras_reporting": 0,
                "total_kendras": 0,
                "coverage_percent": 0.0,
            },
            "generated_at": generated_at.isoformat(),
        }
    raise ValueError(f"Unsupported ops role: {role}")
