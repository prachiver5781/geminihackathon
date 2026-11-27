import os
import sys
from pathlib import Path
from typing import List
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from salt_service import compare_prescription_medicines
from backend.voice_ops.api import router as voice_ops_router

app = FastAPI(title="Prachi - Gemini Enterprise Grounded PMBJP Salt Engine")
app.include_router(voice_ops_router)


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
    try:
        medicines_list = [m.model_dump() for m in payload.medicines]
        result = compare_prescription_medicines(medicines_list)
        result["grounding_mode"] = (
            "GEMINI_ENTERPRISE_VERTEX_SEARCH"
            if os.getenv("VERTEX_DATA_STORE_ID")
            else "LOCAL_PMBJP_GROUNDED_CATALOG"
        )
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Salt comparison error: {exc}")
