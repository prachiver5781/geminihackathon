import json
from pathlib import Path
from typing import Any, Dict, List

CATALOG_PATH = Path(__file__).resolve().parents[2] / "data" / "pmbjp_sample_catalog.json"


def load_catalog(catalog_path: Path = CATALOG_PATH) -> List[Dict[str, Any]]:
    with catalog_path.open("r", encoding="utf-8-sig") as f:
        return json.load(f)


def _normalize(value: str) -> str:
    return " ".join(value.strip().lower().split())


def compare_medicine_against_catalog(
    brand_name: str,
    strength: str = "",
    catalog: List[Dict[str, Any]] | None = None,
) -> Dict[str, Any]:
    items = catalog if catalog is not None else load_catalog()
    norm_brand = _normalize(brand_name)
    norm_strength = _normalize(strength)

    for entry in items:
        entry_brand = _normalize(entry["brand_name"])
        entry_strength = _normalize(entry["strength"])

        brand_matches = norm_brand == entry_brand or (norm_brand and norm_brand in entry_brand)
        strength_matches = (not norm_strength) or (norm_strength == entry_strength)

        if brand_matches and strength_matches:
            branded_mrp = float(entry["branded_mrp"])
            generic_mrp = float(entry["generic_mrp"])
            savings_inr = round(max(0.0, branded_mrp - generic_mrp), 2)
            savings_pct = round((savings_inr / branded_mrp) * 100, 1) if branded_mrp > 0 else 0.0

            return {
                "status": "MATCHED",
                "query_brand": brand_name,
                "query_strength": strength,
                "drug_code": entry["drug_code"],
                "salt_composition": entry["salt_composition"],
                "pack_size": entry["pack_size"],
                "branded_mrp": branded_mrp,
                "generic_mrp": generic_mrp,
                "savings_inr": savings_inr,
                "savings_percent": savings_pct,
                "source_citation": f"PMBJP Catalog ({entry['drug_code']})",
            }

    return {
        "status": "NOT_IN_PMBJP_CATALOG",
        "query_brand": brand_name,
        "query_strength": strength,
        "drug_code": None,
        "salt_composition": None,
        "branded_mrp": None,
        "generic_mrp": None,
        "savings_inr": 0.0,
        "savings_percent": 0.0,
        "reason": "Exact brand/strength not found in grounded PMBJP catalog; no price guessed.",
        "source_citation": "PMBJP Grounded Guardrail",
    }


def compare_prescription_medicines(medicines: List[Dict[str, str]]) -> Dict[str, Any]:
    catalog = load_catalog()
    results = [
        compare_medicine_against_catalog(
            brand_name=m.get("brand_name", ""),
            strength=m.get("strength", ""),
            catalog=catalog,
        )
        for m in medicines
    ]
    total_branded = round(sum(r["branded_mrp"] or 0.0 for r in results), 2)
    total_generic = round(sum(r["generic_mrp"] or 0.0 for r in results), 2)
    total_savings = round(sum(r["savings_inr"] for r in results), 2)

    return {
        "items": results,
        "summary": {
            "total_branded_mrp": total_branded,
            "total_generic_mrp": total_generic,
            "total_savings_inr": total_savings,
            "matched_count": sum(1 for r in results if r["status"] == "MATCHED"),
            "unlisted_count": sum(1 for r in results if r["status"] == "NOT_IN_PMBJP_CATALOG"),
        },
    }
