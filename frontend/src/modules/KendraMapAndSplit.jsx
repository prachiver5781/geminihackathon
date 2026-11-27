import { useCallback, useEffect, useState } from 'react';

const API = import.meta.env?.VITE_KENDRA_API_URL || 'http://127.0.0.1:8001';
const allMedicines = [
  { salt_or_code: 'METFORMIN_500', name: 'Metformin 500mg', qty: 2 },
  { salt_or_code: 'ATORVASTATIN_10', name: 'Atorvastatin 10mg', qty: 1 },
  { salt_or_code: 'TELMISARTAN_40', name: 'Telmisartan 40mg', qty: 1 },
];
const splitMedicine = { salt_or_code: 'AMLODIPINE_5', name: 'Amlodipine 5mg', qty: 1 };
const medicineCatalog = [...allMedicines, splitMedicine];

const scenarios = {
  'All in One Store': { lat: 30.901, lng: 75.8573, medicines: allMedicines, currentTimeIso: '2026-11-27T19:00:00+05:30' },
  'Split Basket Needed': { lat: 30.901, lng: 75.8573, medicines: [...allMedicines, splitMedicine], currentTimeIso: '2026-11-27T19:00:00+05:30' },
  'Closing Soon Warning': { lat: 30.901, lng: 75.8573, medicines: allMedicines, currentTimeIso: '2026-11-27T20:45:00+05:30' },
};

const panel = { border: '1px solid #d8dee8', borderRadius: 12, padding: 16, background: '#fff' };
const button = { border: 0, borderRadius: 8, padding: '9px 13px', background: '#176b45', color: 'white', cursor: 'pointer', fontWeight: 650 };

export default function KendraMapAndSplit({ onNavigateNearest, onRefreshKendras, onNavigationBrief }) {
  const [selectedScenario, setSelectedScenario] = useState('All in One Store');
  const [lat, setLat] = useState(scenarios['All in One Store'].lat);
  const [lng, setLng] = useState(scenarios['All in One Store'].lng);
  const [medicines, setMedicines] = useState(allMedicines);
  const [currentTimeIso, setCurrentTimeIso] = useState(scenarios['All in One Store'].currentTimeIso);
  const [newMedicine, setNewMedicine] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPayload, setShowPayload] = useState(false);
  const [payload, setPayload] = useState(null);

  const recommend = useCallback(async (overrides = {}) => {
    const request = { lat: Number(lat), lng: Number(lng), medicines,
      current_time_iso: currentTimeIso || new Date().toISOString(), ...overrides };
    setLoading(true); setError(''); setPayload(request);
    try {
      const response = await fetch(`${API}/api/kendra/recommend`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || `Request failed (${response.status})`);
      setResult(body);
    } catch (e) { setError(`${e.message}. Check that the Kendra API is running at ${API}.`); }
    finally { setLoading(false); }
  }, [lat, lng, medicines, currentTimeIso]);

  const startNavigation = useCallback((url) => {
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  useEffect(() => {
    const onVoiceNavigate = (event) => {
      const requestedId = event.detail?.target_kendra_id;
      const store = (requestedId && result?.stores?.find(s => s.kendra_id === requestedId)) || result?.nearest_single_store;
      if (store?.google_maps_url) {
        if (onNavigateNearest) onNavigateNearest(store);
        else startNavigation(store.google_maps_url);
      } else {
        onRefreshKendras?.();
        recommend();
      }
    };
    const onVoiceRefresh = () => { onRefreshKendras?.(); recommend(); };
    window.addEventListener('ronak:navigate-nearest', onVoiceNavigate);
    window.addEventListener('ronak:refresh-kendras', onVoiceRefresh);
    return () => {
      window.removeEventListener('ronak:navigate-nearest', onVoiceNavigate);
      window.removeEventListener('ronak:refresh-kendras', onVoiceRefresh);
    };
  }, [result, startNavigation, recommend, onNavigateNearest, onRefreshKendras]);

  function chooseScenario(name) {
    const scenario = scenarios[name]; setSelectedScenario(name); setLat(scenario.lat); setLng(scenario.lng);
    setMedicines(scenario.medicines); setCurrentTimeIso(scenario.currentTimeIso); setResult(null);
  }

  function addMedicine() {
    const candidate = medicineCatalog.find(m => m.salt_or_code === newMedicine);
    if (candidate && !medicines.some(m => m.salt_or_code === candidate.salt_or_code)) setMedicines([...medicines, candidate]);
    setNewMedicine('');
  }

  const openNavigationBrief = async (store) => {
    try {
      const response = await fetch(`${API}/api/kendra/navigation-brief`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: Number(lat), lng: Number(lng), target_kendra_id: store.kendra_id, voice_mode: true }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || 'Navigation request failed');
      window.dispatchEvent(new CustomEvent('ronak:navigation-brief', { detail: body }));
      onNavigationBrief?.(body);
      if (onNavigateNearest) onNavigateNearest(store, body);
      else startNavigation(body.google_maps_url);
    } catch (e) { setError(e.message); }
  };

  const storeCard = (store, assigned = null) => <article key={store.kendra_id} style={{ ...panel, minWidth: 235, flex: '1 1 235px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <strong>{store.kendra_name}</strong>
      {store.closing_soon_warning && <span style={{ color: '#9a3412', background: '#ffedd5', borderRadius: 20, padding: '3px 8px', height: 'fit-content', fontSize: 12 }}>{store.is_open ? 'Closing soon' : 'Closed now'}</span>}
    </div>
    <p style={{ margin: '8px 0', color: '#4b5563' }}>{store.distance_km} km · about {store.estimated_drive_mins} min · closes {store.closing_time}</p>
    <ul style={{ paddingLeft: 20, margin: '8px 0' }}>{store.items.map(item => <li key={item.salt_or_code} style={{ color: item.available ? '#166534' : '#b91c1c' }}>
      {item.available ? '✓' : '×'} {item.name}: {item.available_qty} available / {item.requested_qty} requested
    </li>)}</ul>
    {store.missing_items?.length > 0 && <p style={{ color: '#b91c1c', margin: '6px 0' }}>Missing: {store.missing_items.join(', ')}</p>}
    {assigned && <p style={{ margin: '6px 0' }}>Basket items: {assigned.join(', ')}</p>}
    <button type="button" style={button} onClick={() => openNavigationBrief(store)}>Start Navigation</button>
  </article>;

  return <main style={{ maxWidth: 1120, margin: '0 auto', padding: 20, color: '#142018', background: '#f6f8f7', fontFamily: 'system-ui, sans-serif' }}>
    <header style={{ marginBottom: 18 }}><h1 style={{ margin: '0 0 5px' }}>Jan Aushadhi Kendra Finder</h1>
      <p style={{ margin: 0, color: '#52605a' }}>Compare nearby stock and plan a single-store or split-basket trip. Seed inventory is for demo use.</p></header>
    <section style={{ ...panel, marginBottom: 16 }}>
      <label>Test scenario <select onChange={e => chooseScenario(e.target.value)} value={selectedScenario} style={{ marginLeft: 8, padding: 7 }}>
        {Object.keys(scenarios).map(name => <option key={name}>{name}</option>)}
      </select></label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, margin: '12px 0' }}>
        <label>Latitude <input type="number" step="0.0001" value={lat} onChange={e => setLat(e.target.value)} /></label>
        <label>Longitude <input type="number" step="0.0001" value={lng} onChange={e => setLng(e.target.value)} /></label>
      </div>
      <div style={{ margin: '10px 0' }}><strong>Medicine list</strong>
        {medicines.map(m => <div key={m.salt_or_code} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 6 }}>
          <span>{m.name}</span><label>Qty <input aria-label={`${m.name} quantity`} type="number" min="1" value={m.qty} style={{ width: 70 }} onChange={e => setMedicines(medicines.map(item => item.salt_or_code === m.salt_or_code ? { ...item, qty: Math.max(1, Number(e.target.value)) } : item))} /></label>
          <button type="button" onClick={() => setMedicines(medicines.filter(item => item.salt_or_code !== m.salt_or_code))}>Remove</button>
        </div>)}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><select aria-label="Add medicine" value={newMedicine} onChange={e => setNewMedicine(e.target.value)}>
          <option value="">Add a seeded medicine…</option>{medicineCatalog.filter(m => !medicines.some(item => item.salt_or_code === m.salt_or_code)).map(m => <option key={m.salt_or_code} value={m.salt_or_code}>{m.name}</option>)}
        </select><button type="button" onClick={addMedicine} disabled={!newMedicine}>Add</button></div>
      </div>
      <button type="button" style={button} disabled={loading} onClick={() => recommend()}>{loading ? 'Finding Kendras…' : 'Find Kendras'}</button>
      <button type="button" onClick={() => setShowPayload(v => !v)} style={{ ...button, marginLeft: 8, background: '#475569' }}>{showPayload ? 'Hide' : 'Show'} API / Payload Inspector</button>
      {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
      {showPayload && <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 320, overflow: 'auto', background: '#f1f5f9', padding: 12, borderRadius: 8 }}>{JSON.stringify({ request: payload, response: result }, null, 2)}</pre>}
    </section>
    {result && <>
      <p style={{ fontSize: 13, color: '#52605a' }}>Source: {result.data_source}{result.is_mock ? ' (mock inventory)' : ''}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))', gap: 16 }}>
        <section><h2>Single-Store Option</h2>
          {storeCard(result.nearest_single_store)}
          <p>{result.nearest_single_store.covers_all ? 'All requested medicines are available here.' : 'Partial option. Missing items are listed above.'}</p>
        </section>
        <section><h2>Split-Basket Option</h2>
          {!result.split_basket_plan.complete ? <p>Could not fulfill the full basket from the seeded stores. Missing: {result.split_basket_plan.missing_items?.join(', ')}</p> : <>
            <p>{result.split_basket_plan.stops.length} stops · {result.split_basket_plan.total_travel_distance_km} km estimated route</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>{result.split_basket_plan.stops.map(stop => storeCard(stop.store, stop.assigned_items))}</div>
          </>}
        </section>
      </div>
      <section style={{ marginTop: 18 }}><h2>Nearby Kendra stock</h2><div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>{result.stores.map(store => storeCard(store))}</div></section>
    </>}
  </main>;
}
