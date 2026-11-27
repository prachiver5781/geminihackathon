import React, { useState } from "react";
import SaltComparisonCard from "./SaltComparisonCard.jsx";

export default function PrescriptionScanner({ onMedicinesConfirmed, saltComparisonApiUrl }) {
  const [file, setFile] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [confirmedPayload, setConfirmedPayload] = useState(null);

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setConfirmedPayload(null);
    const formData = new FormData();
    formData.append("prescription", file);

    try {
      const res = await fetch("http://localhost:5002/api/prescription/parse", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      setItems(json.data || []);
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const updateItem = (idx, field, value) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], [field]: value, needs_confirmation: false };
    setItems(updated);
    setConfirmedPayload(null);
  };

  const confirmMedicines = () => {
    const payload = {
      medicines: items.map(({ brand_name, strength, dosage_form, frequency }) => ({
        brand_name: String(brand_name || "").trim(),
        strength: String(strength || "").trim(),
        dosage_form: String(dosage_form || "").trim(),
        frequency: String(frequency || "").trim(),
      })),
    };
    setConfirmedPayload(payload);
    onMedicinesConfirmed?.(payload);
  };

  return (
    <div className="p-4 border rounded-xl bg-slate-900 text-white space-y-4">
      <h2 className="text-lg font-semibold">1. Scan & Confirm Prescription</h2>
      <div className="flex gap-3 items-center">
        <input
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => setFile(e.target.files[0])}
          className="text-sm"
        />
        <button
          onClick={handleUpload}
          disabled={!file || loading}
          className="px-4 py-2 bg-emerald-600 rounded-lg font-medium disabled:opacity-50"
        >
          {loading ? "Scanning..." : "Extract Medicines"}
        </button>
      </div>

      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((med, i) => (
            <div
              key={i}
              className={`p-3 rounded-lg border flex flex-wrap gap-2 items-center ${
                med.needs_confirmation ? "border-amber-500 bg-amber-950/30" : "border-slate-700"
              }`}
            >
              <input
                value={med.brand_name}
                onChange={(e) => updateItem(i, "brand_name", e.target.value)}
                className="px-2 py-1 bg-slate-800 rounded border border-slate-600"
                placeholder="Medicine Name"
              />
              <input
                value={med.strength}
                onChange={(e) => updateItem(i, "strength", e.target.value)}
                className="px-2 py-1 bg-slate-800 rounded border border-slate-600 w-28"
                placeholder="Strength"
              />
              <span className="text-xs text-slate-400">{med.frequency}</span>
              {med.needs_confirmation && (
                <span className="text-xs text-amber-400 font-medium">
                  Verify unclear handwriting
                </span>
              )}
            </div>
          ))}
          <button
            onClick={confirmMedicines}
            className="px-4 py-2 bg-blue-600 rounded-lg font-medium mt-2"
          >
            Confirm & Find Jan Aushadhi Salts
          </button>
        </div>
      )}

      {confirmedPayload && (
        <SaltComparisonCard
          medicines={confirmedPayload.medicines}
          apiUrl={saltComparisonApiUrl}
        />
      )}
    </div>
  );
}
