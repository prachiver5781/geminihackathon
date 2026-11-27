import React, { useState } from "react";
import SaltComparisonCard from "./SaltComparisonCard.jsx";

export default function PrescriptionScanner({
  onMedicinesConfirmed,
  saltComparisonApiUrl,
  prescriptionApiUrl = "http://localhost:5002/api/prescription/parse",
  showComparisonCard = true,
}) {
  const [file, setFile] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [confirmedPayload, setConfirmedPayload] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [extractionNotice, setExtractionNotice] = useState("");

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setConfirmedPayload(null);
    setUploadError("");
    setExtractionNotice("");
    const formData = new FormData();
    formData.append("prescription", file);

    try {
      const res = await fetch(prescriptionApiUrl, {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Prescription scan failed.");
      const extracted = Array.isArray(json.data) ? json.data : [];
      setItems(extracted);
      setExtractionNotice(json.disclaimer || (json.source?.includes("fallback")
        ? "Demo sample medicines returned. Review every field before confirming."
        : "Review the extracted fields and confirm them before comparison."));
    } catch (err) {
      setUploadError(err.message || "Upload failed. Check that the OCR service is running on port 5002.");
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

      {uploadError && <p role="alert" className="text-sm text-red-300">{uploadError}</p>}
      {extractionNotice && items.length > 0 && (
        <p className="text-sm text-sky-200">{extractionNotice}</p>
      )}

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
              <span className="text-xs text-slate-300">{med.dosage_form || "Dosage form not detected"} · {med.frequency || "Frequency not detected"}</span>
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

      {showComparisonCard && confirmedPayload && (
        <p role="status" className="text-sm text-emerald-200">Medicines confirmed. Looking up catalog matches and prices…</p>
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
