import React from "react";

export default function SaltComparisonCard({ comparisonData }) {
  if (!comparisonData || !comparisonData.items) {
    return null;
  }

  const { items, summary, grounding_mode } = comparisonData;

  return (
    <div style={{ border: "1px solid #d1d5db", borderRadius: "12px", padding: "16px", background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <h3 style={{ margin: 0 }}>Jan Aushadhi Generic Salt & Price Comparison</h3>
        <span style={{ fontSize: "12px", padding: "4px 8px", borderRadius: "6px", background: "#ecfdf5", color: "#065f46" }}>
          Grounded: {grounding_mode || "PMBJP Catalog"}
        </span>
      </div>

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
          {items.map((item, idx) => (
            <tr key={idx} style={{ borderBottom: "1px solid #f3f4f6" }}>
              <td style={{ padding: "8px" }}>{item.query_brand} {item.query_strength}</td>
              <td style={{ padding: "8px" }}>
                {item.status === "MATCHED" ? item.salt_composition : "Exact generic not in PMBJP catalog"}
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

      {summary && (
        <div style={{ padding: "10px 12px", borderRadius: "8px", background: "#f0fdf4", display: "flex", justifyContent: "space-between" }}>
          <span>Matched: <strong>{summary.matched_count}</strong> | Unlisted (No-Guess): <strong>{summary.unlisted_count}</strong></span>
          <span>Total Savings: <strong style={{ color: "#059669" }}>₹{summary.total_savings_inr}</strong></span>
        </div>
      )}
    </div>
  );
}
