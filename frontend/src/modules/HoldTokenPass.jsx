import React, { useCallback, useEffect, useMemo, useState } from "react";

const DEFAULT_STORES = ["PMBJK-CHD-17", "PMBJK-CHD-22"];
const DEFAULT_API_BASE = "http://localhost:8004/api/tokens";

function getDefaultApiBase() {
  // Vite env support; props remain available to other bundlers and hosts.
  try {
    return import.meta.env?.VITE_HOLD_TOKENS_API_BASE_URL || DEFAULT_API_BASE;
  } catch {
    return DEFAULT_API_BASE;
  }
}

function formatCountdown(seconds) {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainder = safe % 60;
  return [hours, minutes, remainder].map((value) => String(value).padStart(2, "0")).join(":");
}

function remainingSeconds(expiresAt) {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

function money(value) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(value || 0));
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

const styles = `
  .htp { --ink:#18302b; --muted:#66756f; --line:#e1e9e4; --green:#176b4d; --green2:#eaf5ef; --gold:#b78127; color:var(--ink); font-family:Inter, ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; max-width:1040px; margin:0 auto; }
  .htp * { box-sizing:border-box; }
  .htp-shell { border:1px solid var(--line); border-radius:22px; background:#fbfdfb; overflow:hidden; box-shadow:0 12px 35px rgba(26,61,48,.07); }
  .htp-hero { padding:28px 30px; background:linear-gradient(112deg,#eaf5ef 0%,#f6f7e9 100%); display:flex; justify-content:space-between; align-items:flex-start; gap:20px; }
  .htp-kicker { color:var(--green); font-size:11px; font-weight:800; letter-spacing:.13em; text-transform:uppercase; }
  .htp h2 { margin:7px 0 6px; font-size:25px; letter-spacing:-.04em; }
  .htp p { margin:0; color:var(--muted); font-size:13px; line-height:1.55; }
  .htp-live { display:inline-flex; align-items:center; gap:8px; padding:8px 11px; border:1px solid #d0e5d8; border-radius:999px; background:#ffffffb8; color:var(--green); font-size:12px; font-weight:700; white-space:nowrap; }
  .htp-dot { width:7px; height:7px; border-radius:50%; background:#31a36e; box-shadow:0 0 0 4px #31a36e22; }
  .htp-content { padding:24px 30px 30px; display:grid; gap:24px; }
  .htp-toolbar { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; }
  .htp-label { display:block; margin-bottom:7px; color:var(--muted); font-size:11px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
  .htp select,.htp input[type=number] { padding:10px 12px; border:1px solid var(--line); border-radius:10px; background:white; color:var(--ink); font:inherit; }
  .htp select { min-width:240px; }
  .htp-section-head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }
  .htp h3 { margin:0; font-size:16px; letter-spacing:-.02em; }
  .htp-subtle { color:var(--muted); font-size:12px; }
  .htp-table-wrap { overflow:auto; border:1px solid var(--line); border-radius:13px; background:#fff; }
  .htp table { width:100%; border-collapse:collapse; min-width:560px; text-align:left; }
  .htp th { padding:11px 14px; color:var(--muted); background:#f6f9f7; font-size:10px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
  .htp td { padding:13px 14px; border-top:1px solid #edf1ee; font-size:13px; }
  .htp td strong { display:block; font-size:13px; }
  .htp td small { display:block; margin-top:3px; color:var(--muted); font-size:11px; }
  .htp-stock { font-weight:800; }
  .htp-stock.low { color:#bc5b37; }
  .htp-qty { width:78px; }
  .htp-check { accent-color:var(--green); width:16px; height:16px; }
  .htp-actions { display:flex; justify-content:flex-end; align-items:center; gap:11px; }
  .htp-button { border:0; border-radius:10px; padding:11px 15px; background:var(--green); color:white; font:inherit; font-size:13px; font-weight:750; cursor:pointer; transition:transform .15s, opacity .15s, background .15s; }
  .htp-button:hover:not(:disabled) { background:#0d583d; transform:translateY(-1px); }
  .htp-button:disabled { opacity:.5; cursor:not-allowed; }
  .htp-button.secondary { border:1px solid var(--line); background:white; color:var(--ink); }
  .htp-button.secondary:hover:not(:disabled) { background:#f4f8f5; }
  .htp-alert { padding:12px 14px; border-radius:11px; font-size:13px; line-height:1.5; }
  .htp-alert.error { border:1px solid #f0d1c5; background:#fff5f1; color:#9c3f24; }
  .htp-alert.success { border:1px solid #cfe7d8; background:#eff8f2; color:#176b4d; }
  .htp-token { display:grid; grid-template-columns:1fr auto; gap:18px; padding:18px; border:1px solid #cde4d5; border-radius:15px; background:linear-gradient(120deg,#f0f8f2,#fff); }
  .htp-token-title { display:flex; align-items:center; flex-wrap:wrap; gap:9px; }
  .htp-token-title h3 { font-size:18px; }
  .htp-badge { padding:5px 9px; border-radius:99px; background:#dcf1e4; color:#176b4d; font-size:10px; font-weight:850; letter-spacing:.06em; }
  .htp-stats { display:flex; flex-wrap:wrap; gap:22px; margin-top:15px; }
  .htp-stat span { display:block; margin-bottom:4px; color:var(--muted); font-size:10px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
  .htp-stat strong { font-size:14px; }
  .htp-count { color:var(--green); font-variant-numeric:tabular-nums; font-size:23px!important; letter-spacing:.03em; }
  .htp-qr { max-width:560px; overflow-wrap:anywhere; color:#53645d!important; font-family:ui-monospace,SFMono-Regular,monospace; font-size:11px!important; }
  .htp-pin { display:inline-flex; gap:8px; align-items:center; padding:7px 10px; border:1px dashed #bdd8c7; border-radius:9px; background:white; color:var(--green); font-weight:850; letter-spacing:.16em; font-variant-numeric:tabular-nums; }
  .htp-warning { margin-top:13px; padding:10px 12px; border:1px solid #f0dcae; border-radius:10px; background:#fff9e9; color:#805d16; font-size:12px; line-height:1.5; }
  .htp-receipt { margin-top:14px; padding:13px; border:1px solid var(--line); border-radius:11px; background:#fff; }
  .htp-receipt table { min-width:430px; }
  .htp-receipt th,.htp-receipt td { padding:8px; font-size:11px; }
  .htp-receipt-totals { display:flex; flex-wrap:wrap; gap:16px; margin-top:12px; }
  .htp-receipt-totals strong { color:var(--green); }
  .htp-token-buttons { display:flex; flex-direction:column; justify-content:center; gap:8px; min-width:170px; }
  .htp-refills { display:grid; gap:9px; }
  .htp-refill { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:13px 14px; border:1px solid var(--line); border-radius:12px; background:white; }
  .htp-refill-info { display:flex; align-items:center; gap:12px; }
  .htp-refill-icon { width:35px; height:35px; display:grid; place-items:center; border-radius:11px; background:#f5f1e4; color:var(--gold); font-size:17px; }
  .htp-refill strong { display:block; font-size:13px; }
  .htp-refill small { display:block; margin-top:3px; color:var(--muted); font-size:11px; }
  .htp-refill .htp-button { padding:9px 11px; white-space:nowrap; font-size:12px; }
  .htp-loading { padding:20px; color:var(--muted); text-align:center; font-size:13px; }
  @media(max-width:700px) { .htp-hero,.htp-content { padding:20px; } .htp-hero { flex-direction:column; } .htp-toolbar { align-items:stretch; flex-direction:column; } .htp select { width:100%; } .htp-token { grid-template-columns:1fr; } .htp-token-buttons { flex-direction:row; flex-wrap:wrap; } .htp-refill { align-items:flex-start; flex-direction:column; } }
`;

/**
 * Standalone Jan Aushadhi stock hold and refill module.
 * @param {{ apiBaseUrl?: string, initialStoreId?: string, storeIds?: string[] }} props
 */
export default function HoldTokenPass({
  apiBaseUrl = getDefaultApiBase(),
  initialStoreId = DEFAULT_STORES[0],
  storeIds = DEFAULT_STORES,
}) {
  const baseUrl = useMemo(() => apiBaseUrl.replace(/\/$/, ""), [apiBaseUrl]);
  const [storeId, setStoreId] = useState(initialStoreId);
  const [inventory, setInventory] = useState(null);
  const [refills, setRefills] = useState([]);
  const [selected, setSelected] = useState({});
  const [quantities, setQuantities] = useState({});
  const [token, setToken] = useState(null);
  const [waitlists, setWaitlists] = useState([]);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loadingInventory, setLoadingInventory] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const request = useCallback(async (path, options) => {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: { ...(options?.body ? { "Content-Type": "application/json" } : {}), ...options?.headers },
    });
    return parseResponse(response);
  }, [baseUrl]);

  const refreshInventory = useCallback(async (id = storeId) => {
    setLoadingInventory(true);
    try {
      const data = await request(`/inventory/${encodeURIComponent(id)}`);
      setInventory(data);
      setSelected((current) => {
        const next = {};
        for (const item of data.items || []) next[item.drug_code] = current[item.drug_code] ?? false;
        return next;
      });
      setQuantities((current) => {
        const next = {};
        for (const item of data.items || []) next[item.drug_code] = current[item.drug_code] ?? 1;
        return next;
      });
      setError("");
      return data;
    } catch (err) {
      setInventory(null);
      setError(err.message || "Could not load store inventory.");
      return null;
    } finally {
      setLoadingInventory(false);
    }
  }, [request, storeId]);

  const refreshRefills = useCallback(async () => {
    try {
      const data = await request("/refill-alerts");
      setRefills(data.alerts || []);
    } catch (err) {
      setError(err.message || "Could not load refill reminders.");
    }
  }, [request]);

  useEffect(() => {
    refreshInventory(storeId);
  }, [refreshInventory, storeId]);

  useEffect(() => {
    refreshRefills();
  }, [refreshRefills]);

  useEffect(() => {
    if (!token || token.status !== "ACTIVE") return undefined;
    const tick = () => setSecondsLeft(remainingSeconds(token.expires_at));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [token]);

  useEffect(() => {
    if (!waitlists.some((entry) => entry.status === "WAITING")) return undefined;
    const poll = async () => {
      const waiting = waitlists.filter((entry) => entry.status === "WAITING");
      for (const entry of waiting) {
        try {
          const latest = await request(`/waitlist/${encodeURIComponent(entry.waitlist_id)}`);
          if (latest.status === "RESERVED" && latest.token) {
            const storeDetails = await request(`/inventory/${encodeURIComponent(latest.store_id)}`);
            setToken({ ...latest.token, store_name: storeDetails.name });
            setStoreId(latest.store_id);
            setNotice(`FIFO waitlist fulfilled. A hold token is active until ${latest.token.expires_at}.`);
            await refreshInventory(latest.store_id);
            setWaitlists((current) => current.filter((item) => item.waitlist_id !== latest.waitlist_id));
          } else {
            setWaitlists((current) => current.map((item) => item.waitlist_id === latest.waitlist_id ? latest : item));
          }
        } catch (err) {
          setError(err.message || "Could not refresh waitlist status.");
        }
      }
    };
    const interval = window.setInterval(poll, 5000);
    return () => window.clearInterval(interval);
  }, [waitlists, request, refreshInventory]);

  const createHold = async (store, lines) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const storeDetails = store === inventory?.store_id
        ? inventory
        : await request(`/inventory/${encodeURIComponent(store)}`);
      const held = await request("/hold", {
        method: "POST",
        body: JSON.stringify({ store_id: store, items: lines }),
      });
      setToken({ ...held, store_name: storeDetails?.name || store });
      setSecondsLeft(remainingSeconds(held.expires_at));
      setNotice(held.closing_warning
        ? `Your stock is reserved until ${held.expires_at}; the pickup window was shortened for store closing.`
        : "Your stock is reserved for the next two hours.");
      if (store !== storeId) setStoreId(store);
      await refreshInventory(store);
    } catch (err) {
      if (err.status === 409) {
        const unavailable = err.payload?.unavailable || [];
        const detail = unavailable.map((line) => `${line.drug_code}: requested ${line.requested_qty}, ${line.available_qty} available`).join("; ");
        setError(err.payload?.closing_warning && !unavailable.length
          ? "The store is within 15 minutes of closing. No items were reserved; choose a later pickup window or another confirmed store."
          : `Stock conflict. No items were reserved.${detail ? ` ${detail}` : " Please refresh and adjust your quantities."}`);
      } else {
        setError(err.message || "Could not create the hold token.");
      }
      await refreshInventory(store);
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = () => {
    const items = (inventory?.items || [])
      .filter((item) => selected[item.drug_code])
      .map((item) => ({ drug_code: item.drug_code, quantity: Number(quantities[item.drug_code] || 1) }));
    if (!items.length) {
      setError("Select at least one medicine to reserve.");
      return;
    }
    createHold(storeId, items);
  };

  const handleFulfill = async () => {
    if (!token) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await request("/fulfill", { method: "POST", body: JSON.stringify({ token_id: token.token_id }) });
      setToken((current) => ({ ...current, ...result }));
      setNotice("Pickup verified. This token is marked FULFILLED.");
      await refreshInventory(token.store_id);
    } catch (err) {
      setError(err.message || "Could not verify pickup.");
    } finally {
      setBusy(false);
    }
  };

  const handleExpire = async () => {
    if (!token) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await request("/release-expired", {
        method: "POST",
        body: JSON.stringify({ force_expire_token_id: token.token_id }),
      });
      if (result.released_token_ids?.includes(token.token_id)) {
        setToken((current) => ({ ...current, status: "EXPIRED" }));
        const issued = result.activated_waitlist?.length || 0;
        setNotice(`Demo expiry applied. Released stock returned to inventory${issued ? ` and created ${issued} FIFO waitlist hold${issued === 1 ? "" : "s"}` : ""}.`);
      } else {
        setNotice("No active reservation was released for this token.");
      }
      await refreshInventory(token.store_id);
    } catch (err) {
      setError(err.message || "Could not release the token.");
    } finally {
      setBusy(false);
    }
  };

  const handleReReserve = (alert) => {
    createHold(alert.preferred_store, [{ drug_code: alert.drug_code, quantity: 1 }]);
  };

  const handleJoinWaitlist = async (item) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const entry = await request("/waitlist", {
        method: "POST",
        body: JSON.stringify({ store_id: storeId, drug_code: item.drug_code, qty: 1 }),
      });
      setWaitlists((current) => [...current.filter((queued) => queued.waitlist_id !== entry.waitlist_id), entry]);
      setNotice(`${item.salt} added to the FIFO waitlist at position ${entry.position}. This page will check for an automatic reservation.`);
    } catch (err) {
      setError(err.status === 409 ? "Stock is available now. Refresh inventory and create a hold instead." : (err.message || "Could not join the waitlist."));
      await refreshInventory(storeId);
    } finally {
      setBusy(false);
    }
  };

  const activeToken = token?.status === "ACTIVE";

  return (
    <section className="htp" aria-label="Jan Aushadhi hold token pass">
      <style>{styles}</style>
      <div className="htp-shell">
        <header className="htp-hero">
          <div>
            <div className="htp-kicker">Jan Aushadhi · Price transparency</div>
            <h2>Hold Token Pass</h2>
            <p>Check store stock, reserve at listed MRP, and share a pickup PIN with your caregiver.</p>
          </div>
          <div className="htp-live"><span className="htp-dot" /> Live store stock</div>
        </header>

        <div className="htp-content">
          {error && <div className="htp-alert error" role="alert">{error}</div>}
          {notice && <div className="htp-alert success" role="status">{notice}</div>}

          {token && (
            <section className="htp-token" aria-live="polite">
              <div>
                <div className="htp-token-title">
                  <h3>Reservation pass</h3>
                  <span className="htp-badge">{token.status}</span>
                </div>
                <div className="htp-stats">
                  <div className="htp-stat"><span>Token ID</span><strong>{token.token_id}</strong></div>
                  <div className="htp-stat"><span>Store</span><strong>{token.store_name || token.store_id}</strong></div>
                  <div className="htp-stat"><span>Total payable</span><strong>{money(token.total_payable_inr)}</strong></div>
                  <div className="htp-stat"><span>Family pickup PIN</span><strong className="htp-pin">{token.proxy_pin}</strong><small>Share with your family member or caregiver for pickup.</small></div>
                  <div className="htp-stat"><span>{activeToken ? "Time remaining" : "Token state"}</span><strong className={activeToken ? "htp-count" : ""}>{activeToken ? formatCountdown(secondsLeft) : token.status}</strong></div>
                </div>
                {token.closing_warning && <div className="htp-warning">Pickup window shortened to finish 15 minutes before store closing. Collect by {new Date(token.expires_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST.</div>}
                <div className="htp-stat" style={{ marginTop: 15 }}>
                  <span>QR payload</span>
                  <p className="htp-qr">{token.qr_payload}</p>
                </div>
                {token.receipt && <div className="htp-receipt">
                  <div className="htp-section-head"><h3>Fulfillment savings receipt</h3><span className="htp-subtle">{token.fulfilled_at}</span></div>
                  <div className="htp-table-wrap"><table><thead><tr><th>Medicine</th><th>Qty</th><th>Branded equivalent</th><th>Jan Aushadhi paid</th><th>Saved</th></tr></thead>
                    <tbody>{token.receipt.items.map((item) => <tr key={item.drug_code}><td>{item.salt}<small>{item.drug_code}</small></td><td>{item.quantity}</td><td>{money(item.branded_equivalent_line_total)}</td><td>{money(item.jan_aushadhi_paid_line)}</td><td>{money(item.saved_line_inr)}</td></tr>)}</tbody></table></div>
                  <div className="htp-receipt-totals"><span>Branded equivalent: <strong>{money(token.receipt.branded_equivalent_total)}</strong></span><span>Jan Aushadhi paid: <strong>{money(token.receipt.jan_aushadhi_paid)}</strong></span><span>Total saved: <strong>{money(token.receipt.total_saved_inr)}</strong></span></div>
                  <p className="htp-subtle" style={{ marginTop: 8 }}>{token.receipt.benchmark_note}</p>
                </div>}
              </div>
              <div className="htp-token-buttons">
                <button className="htp-button" onClick={handleFulfill} disabled={busy || !activeToken}>Store Verify Pickup</button>
                <button className="htp-button secondary" onClick={handleExpire} disabled={busy || !activeToken}>Simulate 2-Hr Expiry</button>
              </div>
            </section>
          )}

          <section>
            <div className="htp-toolbar">
              <div>
                <label className="htp-label" htmlFor="htp-store">Selected Jan Aushadhi Kendra</label>
                <select id="htp-store" value={storeId} onChange={(event) => { setStoreId(event.target.value); setNotice(""); }}>
                  {storeIds.map((id) => <option key={id} value={id}>{id}</option>)}
                </select>
              </div>
              {inventory && <div className="htp-subtle">{inventory.address} · Closes {inventory.closing_hour_ist}</div>}
            </div>
          </section>

          <section>
            <div className="htp-section-head">
              <h3>Live inventory</h3>
              {inventory && <span className="htp-subtle">Prices shown at store MRP</span>}
            </div>
            {loadingInventory ? <div className="htp-loading">Loading live stock…</div> : inventory ? (
              <div className="htp-table-wrap">
                <table>
                  <thead><tr><th>Select</th><th>Generic salt</th><th>PMBJP code</th><th>Available</th><th>MRP</th><th>Qty / queue</th></tr></thead>
                  <tbody>
                    {inventory.items?.map((item) => {
                      const out = item.available_qty < 1;
                      return (
                        <tr key={item.drug_code}>
                          <td><input className="htp-check" type="checkbox" aria-label={`Select ${item.salt}`} checked={!!selected[item.drug_code]} disabled={out} onChange={(event) => setSelected((current) => ({ ...current, [item.drug_code]: event.target.checked }))} /></td>
                          <td><strong>{item.salt}</strong><small>Closes {item.closing_hour_ist}</small></td>
                          <td>{item.drug_code}</td>
                          <td className={`htp-stock ${out ? "low" : ""}`}>{item.available_qty} units</td>
                          <td>{money(item.mrp)}</td>
                          <td>{out ? <button className="htp-button secondary" onClick={() => handleJoinWaitlist(item)} disabled={busy}>Join FIFO waitlist</button> : <input className="htp-qty" aria-label={`Quantity for ${item.salt}`} type="number" min="1" max={item.available_qty} value={quantities[item.drug_code] || 1} onChange={(event) => setQuantities((current) => ({ ...current, [item.drug_code]: Math.max(1, Number(event.target.value)) }))} />}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <div className="htp-loading">Store inventory is unavailable. Check that the hold-token service is running.</div>}
            <div className="htp-actions" style={{ marginTop: 13 }}>
              <button className="htp-button secondary" onClick={() => refreshInventory()} disabled={busy || loadingInventory}>Refresh stock</button>
              <button className="htp-button" onClick={handleCreate} disabled={busy || loadingInventory || !inventory}>Create 2-Hour Hold-Token</button>
            </div>
          </section>

          {waitlists.length > 0 && <section>
            <div className="htp-section-head"><h3>Stock release waitlist</h3><span className="htp-subtle">FIFO · checks automatically while this page is open</span></div>
            <div className="htp-refills">{waitlists.map((entry) => <div className="htp-refill" key={entry.waitlist_id}>
              <div><strong>{entry.salt} · {entry.drug_code}</strong><small>{entry.store_id} · Qty {entry.qty} · Position {entry.position} · {entry.status}</small></div>
              <span className="htp-badge">{entry.status}</span>
            </div>)}</div>
          </section>}

          <section>
            <div className="htp-section-head">
              <div>
                <h3>Monthly Chronic-Care Refill Watcher</h3>
                <p style={{ marginTop: 4 }}>Refill reminders for ongoing care</p>
              </div>
              <button className="htp-button secondary" onClick={refreshRefills} disabled={busy}>Refresh reminders</button>
            </div>
            <div className="htp-refills">
              {refills.length ? refills.map((alert, index) => (
                <div className="htp-refill" key={`${alert.drug_code}-${alert.preferred_store}-${index}`}>
                  <div className="htp-refill-info">
                    <div className="htp-refill-icon" aria-hidden="true">＋</div>
                    <div><strong>{alert.salt}</strong><small>{alert.drug_code} · {alert.days_remaining} days remaining · Preferred: {alert.preferred_store}</small></div>
                  </div>
                  <button className="htp-button" onClick={() => handleReReserve(alert)} disabled={busy}>1-Tap Re-Reserve</button>
                </div>
              )) : <div className="htp-loading">Loading refill reminders…</div>}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
