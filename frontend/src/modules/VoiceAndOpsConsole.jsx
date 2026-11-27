import React, { useEffect, useRef, useState } from "react";

const INTENT_COMMANDS = [
  "Scan my prescription",
  "Compare generic salts",
  "Find the nearest Kendra",
  "Reserve a pickup token",
  "Start navigation to the Kendra",
  "Read the audio guide",
];

const INTENT_LABELS = {
  SCAN_PRESCRIPTION: "Scan prescription",
  COMPARE_SALTS: "Compare generic salts",
  FIND_KENDRA: "Find a Kendra",
  RESERVE_TOKEN: "Reserve pickup token",
  START_NAVIGATION: "Start navigation",
  READ_AUDIO_GUIDE: "Read audio guide",
  UNKNOWN_INTENT: "Not understood",
};

const panelStyle = {
  background: "#fff",
  border: "1px solid #dfe7df",
  borderRadius: 16,
  padding: 22,
  boxShadow: "0 8px 26px rgba(27, 55, 35, .06)",
};
const buttonStyle = {
  border: "1px solid #cbd7cd",
  borderRadius: 9,
  background: "#fff",
  color: "#193124",
  padding: "10px 13px",
  cursor: "pointer",
};

function Status({ loading, error, empty }) {
  if (loading) return <p role="status">Loading…</p>;
  if (error) return <p role="alert" style={{ color: "#b42318" }}>{error}</p>;
  if (empty) return <p>No data to show for this selection yet.</p>;
  return null;
}

export default function VoiceAndOpsConsole() {
  const [language, setLanguage] = useState("en-IN");
  const [transcript, setTranscript] = useState("");
  const [intentResult, setIntentResult] = useState(null);
  const [intentLoading, setIntentLoading] = useState(false);
  const [intentError, setIntentError] = useState("");
  const [role, setRole] = useState("patient");
  const [kendraId, setKendraId] = useState("PMBJK_01");
  const [district, setDistrict] = useState("Ludhiana");
  const [opsData, setOpsData] = useState(null);
  const [opsLoading, setOpsLoading] = useState(false);
  const [opsError, setOpsError] = useState("");
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  useEffect(() => {
    if (role === "patient") {
      setOpsData(null);
      setOpsError("");
      setOpsLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    const params = role === "operator"
      ? new URLSearchParams({ role, kendra_id: kendraId })
      : new URLSearchParams({ role: "nodal", district });
    setOpsLoading(true);
    setOpsError("");
    fetch(`/api/ops/summary?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Operations summary unavailable (${response.status})`);
        return response.json();
      })
      .then((data) => setOpsData(data))
      .catch((error) => {
        if (error.name !== "AbortError") setOpsError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setOpsLoading(false);
      });
    return () => controller.abort();
  }, [role, kendraId, district]);

  async function submitCommand(command = transcript) {
    setTranscript(command);
    setIntentLoading(true);
    setIntentError("");
    try {
      const response = await fetch("/api/voice/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: command, language }),
      });
      if (!response.ok) throw new Error(`Voice intent unavailable (${response.status})`);
      setIntentResult(await response.json());
    } catch (error) {
      setIntentError(error.message || "Could not reach the voice service.");
    } finally {
      setIntentLoading(false);
    }
  }

  function startListening() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setIntentError("Speech recognition is not available in this browser. Use the text input instead.");
      return;
    }
    setIntentError("");
    const recognition = new Recognition();
    recognition.lang = language;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const heard = event.results[0][0].transcript;
      setTranscript(heard);
      submitCommand(heard);
    };
    recognition.onerror = (event) => {
      setIntentError(`Microphone recognition failed: ${event.error}. You can enter a command below.`);
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  function listenSummary() {
    if (!intentResult?.audio_text || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(intentResult.audio_text);
    utterance.lang = language;
    window.speechSynthesis.speak(utterance);
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f5f8f2", color: "#193124", fontFamily: "Inter, system-ui, sans-serif", padding: "32px 18px" }}>
      <div style={{ maxWidth: 1050, margin: "0 auto", display: "grid", gap: 20 }}>
        <header>
          <p style={{ color: "#32764a", fontWeight: 700, margin: "0 0 6px" }}>JAN AUSHADHI · PRICE TRANSPARENCY</p>
          <h1 style={{ margin: 0 }}>Voice &amp; Operations Console</h1>
          <p style={{ color: "#52655a" }}>Voice shortcuts, audio guidance, and Kendra operations. No medical diagnosis or classification.</p>
        </header>

        <section style={panelStyle} aria-labelledby="voice-heading">
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <h2 id="voice-heading" style={{ margin: 0 }}>Voice command &amp; audio guide</h2>
            <label>
              Language{" "}
              <select value={language} onChange={(event) => setLanguage(event.target.value)} aria-label="Voice language">
                <option value="en-IN">English (India)</option>
                <option value="hi-IN">हिन्दी</option>
              </select>
            </label>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
            <button type="button" style={buttonStyle} onClick={startListening} disabled={listening} aria-label="Start voice command">
              {listening ? "Listening…" : "🎙 Start speaking"}
            </button>
            <input
              value={transcript}
              onChange={(event) => setTranscript(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") submitCommand(); }}
              placeholder="Try: Find the nearest Kendra"
              aria-label="Voice command text"
              style={{ flex: 1, minWidth: 200, padding: "10px 12px", border: "1px solid #cbd7cd", borderRadius: 8 }}
            />
            <button type="button" style={buttonStyle} onClick={() => submitCommand()} disabled={intentLoading}>Send command</button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {INTENT_COMMANDS.map((command) => (
              <button key={command} type="button" onClick={() => submitCommand(command)} style={{ ...buttonStyle, borderRadius: 999, background: "#f8fbf7", padding: "7px 11px" }}>
                {command}
              </button>
            ))}
          </div>
          <Status loading={intentLoading} error={intentError} />
          {intentResult && !intentLoading && (
            <div style={{ marginTop: 16, padding: 14, background: "#f6faf5", borderRadius: 10 }} aria-live="polite">
              <strong aria-label="Detected action intent">{INTENT_LABELS[intentResult.intent] || intentResult.intent}</strong>
              <span style={{ marginLeft: 10, color: "#52655a" }}>Confidence: {(intentResult.confidence * 100).toFixed(0)}%</span>
              <p style={{ margin: "9px 0" }}>{intentResult.audio_text}</p>
              <button type="button" style={buttonStyle} onClick={listenSummary}>Listen Summary</button>
              {intentResult.suggested_commands?.length > 0 && (
                <p style={{ color: "#52655a", marginBottom: 0 }}>Try a specific command such as “{intentResult.suggested_commands[0]}”.</p>
              )}
            </div>
          )}
        </section>

        <section style={panelStyle} aria-labelledby="ops-heading">
          <h2 id="ops-heading" style={{ marginTop: 0 }}>Operations console</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
            <RoleCard
              title="Kendra Operator"
              description="Review pending 2-hour Hold-Tokens, today's pickups, and low-stock alerts."
              selected={role === "operator"}
              onClick={() => setRole("operator")}
            />
            <RoleCard
              title="District Nodal Officer"
              description="Review top demanded generic salts, stockouts, and active Kendra coverage."
              selected={role === "nodal"}
              onClick={() => setRole("nodal")}
            />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 14 }}>
            {role === "operator" && (
              <label>
                Kendra{" "}
                <select value={kendraId} onChange={(event) => setKendraId(event.target.value)}>
                  <option value="PMBJK_01">PMBJK_01 · Model Town</option>
                  <option value="PMBJK_02">PMBJK_02 · Civil Lines</option>
                </select>
              </label>
            )}
            {role === "nodal" && (
              <label>
                District{" "}
                <select value={district} onChange={(event) => setDistrict(event.target.value)}>
                  <option>Ludhiana</option>
                  <option>Amritsar</option>
                </select>
              </label>
            )}
          </div>
          {role === "patient" && <p style={{ color: "#52655a" }}>Choose a role card to view its local operations summary.</p>}
          {role !== "patient" && <Status loading={opsLoading} error={opsError} empty={!opsData || (role === "operator" ? !opsData.kendra : !opsData.top_demanded_generic_salts?.length)} />}
          {role === "operator" && opsData?.kendra && !opsLoading && (
            <div style={{ marginTop: 14, display: "grid", gap: 16 }}>
              <p style={{ margin: 0 }}><strong>{opsData.kendra}</strong> · Pickups today: <strong>{opsData.pickups_today}</strong></p>
              <div>
                <h3>Active / pending 2-hour Hold-Tokens</h3>
                {opsData.hold_tokens.length === 0 ? <p>No active hold tokens.</p> : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {opsData.hold_tokens.map((token) => (
                      <article key={token.token_id} style={{ border: "1px solid #e3ebe3", borderRadius: 9, padding: 12 }}>
                        <strong>{token.token_id}</strong> · {token.status} · expires in {Math.ceil(token.expires_in_seconds / 60)} min
                        <div style={{ color: "#52655a", marginTop: 4 }}>{token.salts.join(", ")}</div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <h3>Low-stock generic salt alerts</h3>
                {opsData.low_stock_alerts.length === 0 ? <p>No low-stock alerts.</p> : opsData.low_stock_alerts.map((alert) => (
                  <p key={alert.salt} style={{ margin: "6px 0" }}>{alert.salt}: {alert.available_units} units (reorder at {alert.reorder_level})</p>
                ))}
              </div>
            </div>
          )}
          {role === "nodal" && opsData && !opsLoading && opsData.top_demanded_generic_salts?.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
                <Metric label="Active Kendras" value={`${opsData.coverage.active_kendras} / ${opsData.coverage.total_kendras}`} />
                <Metric label="Coverage" value={`${opsData.coverage.coverage_percent}%`} />
                <Metric label="Stockouts" value={opsData.stockout_count} />
                <Metric label="Unmet demand" value={opsData.unmet_demand_count} />
              </div>
              <h3>Top demanded generic salts</h3>
              <ol>{opsData.top_demanded_generic_salts.map((item) => <li key={item.salt}>{item.salt} — {item.requested_units.toLocaleString()} requested units</li>)}</ol>
            </div>
          )}
        </section>
        <footer style={{ color: "#52655a", fontSize: 13 }}>Demo operations data is seeded locally. Voice features do not diagnose or classify medical conditions.</footer>
      </div>
    </main>
  );
}

function RoleCard({ title, description, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      style={{ ...buttonStyle, textAlign: "left", padding: 16, borderColor: selected ? "#32764a" : "#dfe7df", background: selected ? "#f0f7ef" : "#fff" }}
    >
      <strong style={{ display: "block", marginBottom: 6 }}>{title}</strong>
      <span style={{ color: "#52655a", lineHeight: 1.45 }}>{description}</span>
    </button>
  );
}

function Metric({ label, value }) {
  return <div style={{ border: "1px solid #e3ebe3", borderRadius: 10, padding: 13 }}>
    <div style={{ color: "#52655a", fontSize: 13 }}>{label}</div>
    <strong style={{ fontSize: 22 }}>{value}</strong>
  </div>;
}
