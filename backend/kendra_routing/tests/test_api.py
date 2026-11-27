from fastapi.testclient import TestClient

from main import app, haversine_km

client = TestClient(app)
BASE = {
    "lat": 30.9010, "lng": 75.8573,
    "medicines": [
        {"salt_or_code": "METFORMIN_500", "name": "Metformin 500mg", "qty": 2},
        {"salt_or_code": "ATORVASTATIN_10", "name": "Atorvastatin 10mg", "qty": 1},
        {"salt_or_code": "TELMISARTAN_40", "name": "Telmisartan 40mg", "qty": 1},
    ], "current_time_iso": "2026-11-27T19:00:00+05:30"
}


def test_full_stock_single_store_and_distance():
    response = client.post("/api/kendra/recommend", json=BASE)
    assert response.status_code == 200
    result = response.json()
    single = result["nearest_single_store"]
    assert single["covers_all"]
    assert single["kendra_id"] == "LUD-001"
    assert single["distance_km"] == round(haversine_km(30.901, 75.8573, single["lat"], single["lng"]), 2)
    assert result["split_basket_plan"]["complete"]


def test_split_plan_assigns_each_item_once():
    request = {**BASE, "medicines": [
        *BASE["medicines"],
        {"salt_or_code": "AMLODIPINE_5", "name": "Amlodipine 5mg", "qty": 1},
    ]}
    result = client.post("/api/kendra/recommend", json=request).json()
    plan = result["split_basket_plan"]
    assert plan["complete"]
    assigned = [code for stop in plan["stops"] for code in stop["assigned_items"]]
    assert sorted(assigned) == ["AMLODIPINE_5", "ATORVASTATIN_10", "METFORMIN_500", "TELMISARTAN_40"]
    assert len(assigned) == len(set(assigned))
    assert len(plan["stops"]) >= 2


def test_closing_warning_and_navigation_brief():
    request = {**BASE, "current_time_iso": "2026-11-27T20:45:00+05:30"}
    result = client.post("/api/kendra/recommend", json=request).json()
    store = next(s for s in result["stores"] if s["kendra_id"] == "LUD-001")
    assert store["closing_soon_warning"]
    assert store["google_maps_url"].startswith("https://www.google.com/maps/dir/?api=1&")
    brief = client.post("/api/kendra/navigation-brief", json={
        "lat": BASE["lat"], "lng": BASE["lng"], "target_kendra_id": "LUD-001", "voice_mode": True
    }).json()
    assert "Navigation started" in brief["navigation_summary"]
    assert "google.com/maps/dir" in brief["google_maps_url"]


def test_already_closed_kendra_warns_and_missing_items_are_accounted_for():
    request = {**BASE, "medicines": [*BASE["medicines"],
        {"salt_or_code": "UNKNOWN_CODE", "name": "Unknown item", "qty": 1}],
        "current_time_iso": "2026-11-27T21:15:00+05:30"}
    response = client.post("/api/kendra/recommend", json=request)
    assert response.status_code == 200
    result = response.json()
    closed = next(s for s in result["stores"] if s["kendra_id"] == "LUD-001")
    assert not closed["is_open"]
    assert closed["closing_soon_warning"]
    plan = result["split_basket_plan"]
    assigned = [code for stop in plan["stops"] for code in stop["assigned_items"]]
    accounted_for = assigned + plan["missing_items"]
    requested = [medicine["salt_or_code"] for medicine in request["medicines"]]
    assert sorted(accounted_for) == sorted(requested)
    assert len(accounted_for) == len(set(accounted_for))


def test_invalid_duplicate_medicines_and_navigation_target_return_clear_errors():
    duplicate = {**BASE, "medicines": [BASE["medicines"][0], BASE["medicines"][0]]}
    response = client.post("/api/kendra/recommend", json=duplicate)
    assert response.status_code == 422
    assert "only once" in response.json()["detail"]

    response = client.post("/api/kendra/navigation-brief", json={
        "lat": BASE["lat"], "lng": BASE["lng"], "target_kendra_id": "UNKNOWN", "voice_mode": True
    })
    assert response.status_code == 404
    assert response.json()["detail"] == "Unknown target_kendra_id"
