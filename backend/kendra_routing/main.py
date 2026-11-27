"""Jan Aushadhi Kendra recommendations and basket routing API.

Run with: uvicorn main:app --reload --port 8001 (from this directory).
"""
from datetime import datetime
from itertools import combinations, permutations
from math import asin, cos, radians, sin, sqrt
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="Jan Aushadhi Kendra Routing API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                   allow_methods=["*"], allow_headers=["*"])
DATA_SOURCE = "seeded_demo_inventory"

# Demo data around Ludhiana. Stock and hours are illustrative, not live.
KENDRAS = [
    {"kendra_id": "LUD-001", "kendra_name": "Jan Aushadhi Kendra - Sarabha Nagar", "lat": 30.8942, "lng": 75.8211, "opens": "08:00", "closes": "21:00", "stock": {"METFORMIN_500": 24, "ATORVASTATIN_10": 12, "TELMISARTAN_40": 9, "AMLODIPINE_5": 0}},
    {"kendra_id": "LUD-002", "kendra_name": "Jan Aushadhi Kendra - Civil Lines", "lat": 30.9128, "lng": 75.8502, "opens": "09:00", "closes": "20:00", "stock": {"METFORMIN_500": 0, "ATORVASTATIN_10": 18, "TELMISARTAN_40": 0, "AMLODIPINE_5": 16}},
    {"kendra_id": "LUD-003", "kendra_name": "Jan Aushadhi Kendra - Model Town", "lat": 30.8835, "lng": 75.8560, "opens": "08:30", "closes": "22:00", "stock": {"METFORMIN_500": 0, "ATORVASTATIN_10": 0, "TELMISARTAN_40": 14, "AMLODIPINE_5": 0}},
    {"kendra_id": "LUD-004", "kendra_name": "Jan Aushadhi Kendra - Ferozepur Road", "lat": 30.9018, "lng": 75.8039, "opens": "08:00", "closes": "20:30", "stock": {"METFORMIN_500": 5, "ATORVASTATIN_10": 0, "TELMISARTAN_40": 0, "AMLODIPINE_5": 0}},
]


class Medicine(BaseModel):
    salt_or_code: str = Field(min_length=1)
    name: str = Field(min_length=1)
    qty: int = Field(gt=0)


class RecommendRequest(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    medicines: list[Medicine] = Field(min_length=1)
    current_time_iso: Optional[datetime] = None


class NavigationRequest(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    target_kendra_id: str
    voice_mode: bool = False


class MedicineAvailability(BaseModel):
    salt_or_code: str
    name: str
    requested_qty: int
    available_qty: int
    available: bool


class RecommendedStore(BaseModel):
    kendra_id: str
    kendra_name: str
    lat: float
    lng: float
    distance_km: float
    estimated_drive_mins: int
    opening_time: str
    closing_time: str
    closing_soon_warning: bool
    is_open: bool
    google_maps_url: str
    items: list[MedicineAvailability]
    available_items: list[str]
    missing_items: list[str]
    covers_all: bool


class SplitStop(BaseModel):
    store: RecommendedStore
    assigned_items: list[str]


class SplitBasketPlan(BaseModel):
    complete: bool
    total_travel_distance_km: Optional[float]
    stops: list[SplitStop]
    missing_items: list[str] = Field(default_factory=list)


class RecommendResponse(BaseModel):
    data_source: str
    is_mock: bool
    nearest_single_store: RecommendedStore
    split_basket_plan: SplitBasketPlan
    stores: list[RecommendedStore]


class NavigationBrief(BaseModel):
    target_kendra_id: str
    navigation_summary: str
    distance_km: float
    google_maps_url: str
    data_source: str
    is_mock: bool


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    earth_radius_km = 6371.0088
    dlat, dlng = radians(lat2 - lat1), radians(lng2 - lng1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
    return 2 * earth_radius_km * asin(sqrt(a))


def _minutes(hhmm: str) -> int:
    h, m = map(int, hhmm.split(":"))
    return h * 60 + m


def _store(kendra: dict, lat: float, lng: float, current: datetime, medicines: list[Medicine]) -> dict:
    distance = haversine_km(lat, lng, kendra["lat"], kendra["lng"])
    # Road time estimate uses a conservative urban average; Maps provides live routing.
    drive_mins = max(1, round(distance / 22 * 60))
    local_time = current.replace(tzinfo=ZoneInfo("Asia/Kolkata")) if current.tzinfo is None else current.astimezone(ZoneInfo("Asia/Kolkata"))
    close_mins = _minutes(kendra["closes"])
    now_mins = local_time.hour * 60 + local_time.minute
    available_minutes = close_mins - now_mins
    items = []
    for med in medicines:
        stock = kendra["stock"].get(med.salt_or_code, 0)
        items.append({"salt_or_code": med.salt_or_code, "name": med.name, "requested_qty": med.qty,
                      "available_qty": stock, "available": stock >= med.qty})
    return {
        "kendra_id": kendra["kendra_id"], "kendra_name": kendra["kendra_name"],
        "lat": kendra["lat"], "lng": kendra["lng"], "distance_km": round(distance, 2),
        "estimated_drive_mins": drive_mins, "opening_time": kendra["opens"], "closing_time": kendra["closes"],
        # True during the last 30 minutes before closing and whenever closed.
        "closing_soon_warning": available_minutes <= 30,
        "is_open": _minutes(kendra["opens"]) <= now_mins < close_mins,
        "google_maps_url": f"https://www.google.com/maps/dir/?api=1&origin={lat},{lng}&destination={kendra['lat']},{kendra['lng']}&travelmode=driving",
        "items": items,
    }


def _current_time(value: Optional[datetime]) -> datetime:
    return value or datetime.now().astimezone()


def _recommend(request: RecommendRequest) -> dict:
    if len({m.salt_or_code for m in request.medicines}) != len(request.medicines):
        raise HTTPException(status_code=422, detail="Each salt_or_code must appear only once")
    current = _current_time(request.current_time_iso)
    stores = [_store(k, request.lat, request.lng, current, request.medicines) for k in KENDRAS]
    stores.sort(key=lambda s: (not s["is_open"], s["distance_km"], s["kendra_id"]))
    for s in stores:
        s["available_items"] = [i["salt_or_code"] for i in s["items"] if i["available"]]
        s["missing_items"] = [i["salt_or_code"] for i in s["items"] if not i["available"]]
        s["covers_all"] = not s["missing_items"]
    nearest_single = next((s for s in stores if s["covers_all"]), None)
    if nearest_single is None:
        nearest_single = min(stores, key=lambda s: (-len(s["available_items"]), s["distance_km"]))

    # Enumerate small store subsets and stop orders. Each requested medicine is
    # assigned once, to the first store with sufficient unassigned stock.
    best = None
    for size in range(1, len(stores) + 1):
        for subset in combinations(stores, size):
            for order in permutations(subset):
                fulfilled, assignments = set(), []
                for store in order:
                    allocated = []
                    for med in request.medicines:
                        item = next(i for i in store["items"] if i["salt_or_code"] == med.salt_or_code)
                        if med.salt_or_code not in fulfilled and item["available"]:
                            fulfilled.add(med.salt_or_code)
                            allocated.append(med.salt_or_code)
                    if allocated:
                        assignments.append({"store": store, "assigned_items": allocated})
                route_km = 0.0
                prev = (request.lat, request.lng)
                for entry in assignments:
                    dest = entry["store"]
                    route_km += haversine_km(*prev, dest["lat"], dest["lng"])
                    prev = (dest["lat"], dest["lng"])
                missing = [m.salt_or_code for m in request.medicines if m.salt_or_code not in fulfilled]
                score = (len(missing), route_km, len(assignments))
                if best is None or score < best[0]:
                    best = (score, assignments, route_km, missing)
    if best:
        _, assignments, total_distance, missing = best
        split = {"complete": not missing, "total_travel_distance_km": round(total_distance, 2), "stops": [
            {"store": entry["store"], "assigned_items": entry["assigned_items"]} for entry in assignments]}
        if missing:
            split["missing_items"] = missing
    else:
        split = {"complete": False, "total_travel_distance_km": None, "stops": [],
                 "missing_items": [m.salt_or_code for m in request.medicines
                                   if not any(i["available"] for s in stores for i in s["items"] if i["salt_or_code"] == m.salt_or_code)]}
    return {"data_source": DATA_SOURCE, "is_mock": True,
            "nearest_single_store": nearest_single,
            "split_basket_plan": split,
            "stores": stores}


@app.get("/health")
def health():
    return {"status": "ok", "service": "kendra-routing", "data_source": DATA_SOURCE, "is_mock": True}


@app.post("/api/kendra/recommend", response_model=RecommendResponse)
def recommend(request: RecommendRequest):
    return _recommend(request)


@app.post("/api/kendra/navigation-brief", response_model=NavigationBrief)
def navigation_brief(request: NavigationRequest):
    kendra = next((k for k in KENDRAS if k["kendra_id"] == request.target_kendra_id), None)
    if not kendra:
        raise HTTPException(status_code=404, detail="Unknown target_kendra_id")
    distance = haversine_km(request.lat, request.lng, kendra["lat"], kendra["lng"])
    url = f"https://www.google.com/maps/dir/?api=1&origin={request.lat},{request.lng}&destination={kendra['lat']},{kendra['lng']}&travelmode=driving"
    prefix = "Navigation started. " if request.voice_mode else ""
    return {"target_kendra_id": kendra["kendra_id"], "navigation_summary":
            f"{prefix}Head to {kendra['kendra_name']}, about {distance:.1f} kilometers away. Follow Google Maps for live turn-by-turn directions.",
            "distance_km": round(distance, 2), "google_maps_url": url,
            "data_source": DATA_SOURCE, "is_mock": True}
