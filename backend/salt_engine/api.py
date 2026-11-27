import os
from typing import List
from fastapi import FastAPI
from pydantic import BaseModel
from salt_service import compare_prescription_medicines

app = FastAPI(title="Prachi - Gemini Enterprise Grounded PMBJP Salt Engine")


class MedicineQuery(BaseModel):
    brand_name: str
    strength: str = ""


class CompareRequest(BaseModel):
    medicines: List[MedicineQuery]


@app.get("/health")
def health():
    return {
        "status": "ok",
        "module": "salt_engine",
        "ge_datastore_configured": bool(os.getenv("VERTEX_DATA_STORE_ID")),
    }


@app.post("/api/salt/compare")
def compare_salts(payload: CompareRequest):
    medicines_list = [m.model_dump() for m in payload.medicines]
    result = compare_prescription_medicines(medicines_list)
    result["grounding_mode"] = (
        "GEMINI_ENTERPRISE_VERTEX_SEARCH"
        if os.getenv("VERTEX_DATA_STORE_ID")
        else "LOCAL_PMBJP_GROUNDED_CATALOG"
    )
    return result
