import React, { useState } from "react";
import PrescriptionScanner from "./modules/PrescriptionScanner.jsx";
import SaltComparisonCard from "./modules/SaltComparisonCard.jsx";

const PRESCRIPTION_API_URL = "http://localhost:5002/api/prescription/parse";
const SALT_COMPARISON_API_URL = "http://localhost:5002/api/salt/compare";

export default function App() {
  const [confirmedPayload, setConfirmedPayload] = useState(null);

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ margin: "0 0 8px" }}>Prescription to Salt Comparison Demo</h1>
        <p style={{ margin: 0, color: "#475569" }}>
          Upload a prescription, review the extracted fields, then confirm them to compare with the local PMBJP catalog.
        </p>
      </header>

      <PrescriptionScanner
        prescriptionApiUrl={PRESCRIPTION_API_URL}
        saltComparisonApiUrl={SALT_COMPARISON_API_URL}
        showComparisonCard={false}
        onMedicinesConfirmed={setConfirmedPayload}
      />

      {confirmedPayload && (
        <section style={{ marginTop: 20 }} aria-live="polite">
          <SaltComparisonCard
            medicines={confirmedPayload.medicines}
            apiUrl={SALT_COMPARISON_API_URL}
          />
        </section>
      )}

      <p style={{ marginTop: 20, color: "#64748b", fontSize: 13 }}>
        Catalog prices are informational. Confirm any medicine details with a pharmacist or clinician; this demo does not provide medical advice.
      </p>
    </main>
  );
}
