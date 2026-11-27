import React, { useEffect, useState } from "react";

export default function SaltComparisonCard({
  comparisonData,
  medicines,
  apiUrl = "http://localhost:5002/api/salt/compare",
}) {
  const [loadedComparison, setLoadedComparison] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (comparisonData || !Array.isArray(medicines) || medicines.length === 0) {
      setLoadedComparison(null);
      setError("");
      return undefined;
    }

    const controller = new AbortController();
    const compare = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            medicines: medicines.map(({ brand_name, strength, dosage_form, frequency }) => ({
              brand_name,
              strength,
              dosage_form,
              frequency,
            })),
          }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Salt comparison failed (${response.status})`);
        setLoadedComparison(await response.json());
      } catch (err) {
        if (err.name !== "AbortError") setError(err.message || "Unable to compare medicines.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    compare();
    return () => controller.abort();
  }, [comparisonData, medicines, apiUrl]);

  const result = comparisonData || loadedComparison;
  if (!comparisonData && loading) {
    return <div role="status" className="rounded-lg border border-sky-700 bg-sky-950/40 p-4 text-sky-100">Checking the PMBJP catalog for matches and listed prices…</div>;
  }
  if (!comparisonData && error) {
    return <div role="alert" className="rounded-lg border border-amber-700 bg-amber-950/40 p-4 text-amber-100">{error} Confirmed medicines are still available above; start the OCR service on port 5002 and try again.</div>;
  }
  const results = result?.results || result?.items;
  if (!Array.isArray(results)) return null;

  const { summary, grounding_mode, fallback, message } = result;
  const matchedCount = summary?.matched_count ?? results.filter((item) => item.status === "MATCHED").length;
  const unlistedCount = summary?.unlisted_count ?? results.filter((item) => item.status !== "MATCHED").length;
  const totalSavings = result.total_savings ?? summary?.total_savings_inr ?? 0;
  const totalBranded = result.total_branded ?? summary?.total_branded_mrp;
  const totalGeneric = result.total_generic ?? summary?.total_generic_mrp;

  return (
    <div style={{ border: "1px solid #d1d5db", borderRadius: "12px", padding: "16px", background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <h3 style={{ margin: 0 }}>Jan Aushadhi Generic Salt & Price Comparison</h3>
        <span style={{ fontSize: "12px", padding: "4px 8px", borderRadius: "6px", background: "#ecfdf5", color: "#065f46" }}>
          Grounded: {grounding_mode || "PMBJP Catalog"}
        </span>
      </div>

      {message && (
        <p className={`mb-3 rounded-lg p-3 text-sm ${fallback ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-700"}`}>
          {message}
        </p>
      )}
      {fallback && (
        <p role="status" className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Some medicines have no exact catalog match or catalog prices are unavailable. No prices were guessed; review the source citation for each row.
        </p>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "14px" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #e5e7eb", textAlign: "left" }}>
            <th style={{ padding: "8px" }}>Prescribed Brand</th>
            <th style={{ padding: "8px" }}>Generic Salt</th>
            <th style={{ padding: "8px" }}>Branded MRP</th>
            <th style={{ padding: "8px" }}>Jan Aushadhi MRP</th>
            <th style={{ padding: "8px" }}>Savings</th>
            <th style={{ padding: "8px" }}>Source Citation</th>
          </tr>
        </thead>
        <tbody>
          {results.map((item, idx) => (
            <tr key={idx} style={{ borderBottom: "1px solid #f3f4f6" }}>
              <td style={{ padding: "8px" }}>{item.query_brand} {item.query_strength}</td>
              <td style={{ padding: "8px" }}>
                {item.status === "MATCHED"
                  ? item.salt_composition
                  : item.status === "UNAVAILABLE"
                    ? "Comparison data unavailable"
                    : "Exact generic not in PMBJP catalog"}
              </td>
              <td style={{ padding: "8px" }}>{item.branded_mrp ? `₹${item.branded_mrp}` : "—"}</td>
              <td style={{ padding: "8px" }}>{item.generic_mrp ? `₹${item.generic_mrp}` : "—"}</td>
              <td style={{ padding: "8px", fontWeight: "bold", color: item.savings_inr > 0 ? "#059669" : "#6b7280" }}>
                {item.savings_inr > 0 ? `₹${item.savings_inr} (${item.savings_percent}%)` : "₹0"}
              </td>
              <td style={{ padding: "8px", fontSize: "12px" }}>{item.source_citation}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {results.length > 0 && (
        <div style={{ padding: "10px 12px", borderRadius: "8px", background: "#f0fdf4", display: "flex", justifyContent: "space-between" }}>
          <span>Matched: <strong>{matchedCount}</strong> | Unlisted or unavailable: <strong>{unlistedCount}</strong></span>
          <span>
            {totalBranded != null && totalGeneric != null && (
              <>Listed totals: <strong>₹{totalBranded}</strong> / <strong>₹{totalGeneric}</strong> · </>
            )}
            Savings: <strong style={{ color: "#059669" }}>₹{totalSavings}</strong>
          </span>
        </div>
      )}
    </div>
  );
}
