import React, { useEffect, useState } from "react";

const DEFAULT_SAMPLE_MEDICINES = [
  { brand_name: "Augmentin 625 Duo", strength: "625mg" },
  { brand_name: "Pan-D Capsule", strength: "40mg/30mg" },
  { brand_name: "UnknownDrug99", strength: "100mg" },
];

export default function SaltComparisonCard({
  comparisonData: externalData = null,
  apiBaseUrl = "http://127.0.0.1:8001",
}) {
  const [data, setData] = useState(externalData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (externalData) {
      setData(externalData);
    }
  }, [externalData]);

  async function handleRunLiveComparison(medicines = DEFAULT_SAMPLE_MEDICINES) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${apiBaseUrl}/api/salt/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ medicines }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(`Backend call failed (${err.message}). Make sure uvicorn is running on :8001.`);
    } finally {
      setLoading(false);
    }
  }

  const items = data?.items || [];
  const summary = data?.summary || null;

  return (
    <div style={{ border: "1px solid #d1d5db", borderRadius: "12px", padding: "16px", background: "#fff", color: "#111827" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "12px", flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0 }}>Jan Aushadhi Generic Salt & Price Comparison</h3>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#4b5563" }}>
            Grounded salt match + exact savings + zero-hallucination check
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "12px", padding: "4px 8px", borderRadius: "6px", background: "#ecfdf5", color: "#065f46" }}>
            {data?.grounding_mode || "PMBJP Grounded Engine"}
          </span>
          <button
            type="button"
            onClick={() => handleRunLiveComparison()}
            disabled={loading}
            style={{
              padding: "6px 12px",
              borderRadius: "8px",
              border: "none",
              background: "#059669",
              color: "#fff",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 600,
            }}
          >
            {loading ? "Checking..." : "Test Live API"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: "10px 12px", borderRadius: "8px", background: "#fef2f2", color: "#991b1b", marginBottom: "12px", fontSize: "13px" }}>
          {error}
        </div>
      )}

      {items.length > 0 ? (
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "14px", fontSize: "14px" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e5e7eb", textAlign: "left" }}>
              <th style={{ padding: "8px" }}>Prescribed Brand</th>
              <th style={{ padding: "8px" }}>Generic Salt</th>
              <th style={{ padding: "8px" }}>Branded MRP</th>
              <th style={{ padding: "8px" }}>Jan Aushadhi MRP</th>
              <th style={{ padding: "8px" }}>Savings</th>
              <th style={{ padding: "8px" }}>Citation</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: "8px" }}>
                  {item.query_brand} {item.query_strength ? `(${item.query_strength})` : ""}
                </td>
                <td style={{ padding: "8px" }}>
                  {item.status === "MATCHED" ? item.salt_composition : "Not in PMBJP catalog (no guess)"}
                </td>
                <td style={{ padding: "8px" }}>{item.branded_mrp != null ? `₹${item.branded_mrp}` : "—"}</td>
                <td style={{ padding: "8px" }}>{item.generic_mrp != null ? `₹${item.generic_mrp}` : "—"}</td>
                <td style={{ padding: "8px", fontWeight: 700, color: item.savings_inr > 0 ? "#059669" : "#6b7280" }}>
                  {item.savings_inr > 0 ? `₹${item.savings_inr} (${item.savings_percent}%)` : "₹0"}
                </td>
                <td style={{ padding: "8px", fontSize: "12px" }}>{item.source_citation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p style={{ fontSize: "13px", color: "#6b7280", margin: "8px 0 12px" }}>
          Click <strong>Test Live API</strong> (with backend running on <code>http://127.0.0.1:8001</code>) to see live comparison results.
        </p>
      )}

      {summary && (
        <div style={{ padding: "10px 12px", borderRadius: "8px", background: "#f0fdf4", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
          <span>
            Matched: <strong>{summary.matched_count}</strong> | Unlisted (No-Guess): <strong>{summary.unlisted_count}</strong>
          </span>
          <span>
            Total Savings: <strong style={{ color: "#059669" }}>₹{summary.total_savings_inr}</strong>
          </span>
        </div>
      )}
    </div>
  );
}
