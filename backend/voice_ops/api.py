from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from backend.voice_ops.intent_engine import interpret_intent
from backend.voice_ops.ops_data import get_ops_summary

router = APIRouter()


class ContextSummary(BaseModel):
    savings_inr: Optional[float] = Field(default=None, ge=0)
    nearest_kendra: Optional[str] = None
    medicine_count: Optional[int] = Field(default=None, ge=0)


class IntentRequest(BaseModel):
    transcript: str
    language: Literal["en-IN", "hi-IN"]
    context_summary: Optional[ContextSummary] = None


@router.post("/api/voice/intent")
def voice_intent(payload: IntentRequest):
    context = payload.context_summary.model_dump(exclude_none=True) if payload.context_summary else None
    return interpret_intent(payload.transcript, payload.language, context)


@router.get("/api/ops/summary")
def ops_summary(
    role: Literal["operator", "nodal"] = Query(...),
    kendra_id: Optional[str] = None,
    district: Optional[str] = None,
):
    if role == "operator" and not kendra_id:
        raise HTTPException(status_code=422, detail="kendra_id is required for operator role")
    if role == "nodal" and not district:
        raise HTTPException(status_code=422, detail="district is required for nodal role")
    return get_ops_summary(role, kendra_id or "", district or "")
