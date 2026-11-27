import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });
const DEMO_FALLBACK = process.env.DEMO_FALLBACK === "true";
const ALLOW_ERROR_FALLBACK = process.env.ALLOW_ERROR_FALLBACK === "true";

// Clearly labeled demo data for local demos and explicitly enabled error fallback.
// These are extraction examples only and do not constitute medical advice.
const sampleMedicines = [
  {
    brand_name: "Example Paracetamol",
    strength: "500 mg",
    dosage_form: "tablet",
    frequency: "As written on prescription",
    confidence: 0.98,
    needs_confirmation: false,
  },
  {
    brand_name: "Example Cetirizine",
    strength: "10 mg",
    dosage_form: "tablet",
    frequency: "As written on prescription",
    confidence: 0.78,
    needs_confirmation: true,
  },
];

let vertexAI = null;
let localAI = null;
let vertexInitError = null;

try {
  vertexAI = new GoogleGenAI({
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT,
    location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
  });
} catch (error) {
  vertexInitError = error;
  if (!ALLOW_ERROR_FALLBACK && !DEMO_FALLBACK) throw error;
  console.warn("Vertex AI initialization failed; fallback is enabled.");
}

if ((ALLOW_ERROR_FALLBACK || DEMO_FALLBACK) && process.env.GEMINI_API_KEY) {
  try {
    localAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  } catch (error) {
    console.warn("Local Gemini client initialization failed; sample fallback remains available.");
  }
}

const prescriptionSchema = {
  type: Type.OBJECT,
  properties: {
    medicines: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          brand_name: { type: Type.STRING },
          strength: { type: Type.STRING },
          dosage_form: { type: Type.STRING },
          frequency: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
          needs_confirmation: { type: Type.BOOLEAN },
        },
        required: ["brand_name", "strength", "confidence", "needs_confirmation"],
      },
    },
  },
  required: ["medicines"],
};

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const saltPythonScript = `
import json, sys
from pathlib import Path
salt_dir = Path(sys.argv[1])
sys.path.insert(0, str(salt_dir))
from salt_service import compare_prescription_medicines
payload = json.load(sys.stdin)
result = compare_prescription_medicines(payload["medicines"])
print(json.dumps(result, ensure_ascii=False))
`;

function saltFallback(medicines, message) {
  const results = medicines.map((medicine) => ({
    status: "UNAVAILABLE",
    query_brand: String(medicine.brand_name || ""),
    query_strength: String(medicine.strength || ""),
    salt_composition: null,
    branded_mrp: null,
    generic_mrp: null,
    savings_inr: 0,
    savings_percent: 0,
    source_citation: "PMBJP catalog unavailable",
  }));
  return {
    results,
    total_branded: null,
    total_generic: null,
    total_savings: 0,
    fallback: true,
    message: `${message} This comparison is informational and is not medical advice.`,
  };
}

app.post("/api/salt/compare", (req, res) => {
  const medicines = req.body?.medicines;
  if (!Array.isArray(medicines) || medicines.some((medicine) => !medicine || typeof medicine.brand_name !== "string")) {
    return res.status(400).json({ error: "Expected medicines: [{ brand_name, strength, dosage_form, frequency }]" });
  }

  const saltServiceDir = path.resolve(__dirname, "../salt_engine");
  const pythonResult = spawnSync("python3", ["-c", saltPythonScript, saltServiceDir], {
    input: JSON.stringify({ medicines }),
    encoding: "utf8",
    timeout: 10000,
    maxBuffer: 2 * 1024 * 1024,
  });

  if (pythonResult.error || pythonResult.status !== 0) {
    console.warn("Salt comparison Python service unavailable; returning structured fallback.");
    return res.json(saltFallback(medicines, "Salt and price data could not be loaded."));
  }

  try {
    const comparison = JSON.parse(pythonResult.stdout);
    const results = Array.isArray(comparison.items) ? comparison.items : [];
    const totalBranded = Number(comparison.summary?.total_branded_mrp) || 0;
    const totalGeneric = Number(comparison.summary?.total_generic_mrp) || 0;
    const totalSavings = Number(comparison.summary?.total_savings_inr) || 0;
    return res.json({
      results,
      total_branded: totalBranded,
      total_generic: totalGeneric,
      total_savings: totalSavings,
      grounding_mode: "LOCAL_PMBJP_GROUNDED_CATALOG",
      fallback: results.some((item) => item.status === "NOT_IN_PMBJP_CATALOG"),
      message: "Catalog matches are informational only and are not medical advice.",
    });
  } catch (error) {
    console.warn("Salt comparison returned invalid data; returning structured fallback.");
    return res.json(saltFallback(medicines, "Salt and price data could not be read."));
  }
});

app.post("/api/prescription/parse", upload.single("prescription"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No prescription file uploaded" });
    }

    if (DEMO_FALLBACK) {
      return res.json({
        status: "success",
        source: "demo-fallback",
        disclaimer: "Sample extraction data only. This is not medical advice.",
        data: sampleMedicines,
      });
    }

    const base64Image = req.file.buffer.toString("base64");

    const request = {
      model: "gemini-2.5-flash",
      contents: [
        {
          inlineData: {
            mimeType: req.file.mimetype,
            data: base64Image,
          },
        },
        "Extract all prescribed medicines from this image. Do NOT guess blurry or illegible names—if confidence is below 0.85 or handwriting is unclear, set needs_confirmation to true. Do not provide medical advice.",
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: prescriptionSchema,
        temperature: 0.1,
      },
    };

    let response;
    let source = "gemini-enterprise-multimodal";
    try {
      if (!vertexAI) throw vertexInitError || new Error("Vertex AI client is unavailable");
      response = await vertexAI.models.generateContent(request);
    } catch (vertexError) {
      if (!ALLOW_ERROR_FALLBACK && !DEMO_FALLBACK) throw vertexError;
      console.warn("Vertex AI request failed; trying local/sample fallback.");
      if (localAI) {
        try {
          response = await localAI.models.generateContent(request);
          source = "local-gemini-fallback";
        } catch (localError) {
          console.warn("Local Gemini request failed; using sample data.");
        }
      }
      if (!response) {
        return res.json({
          status: "success",
          source: "error-fallback",
          disclaimer: "Sample extraction data only. This is not medical advice.",
          data: sampleMedicines,
        });
      }
    }

    const parsed = JSON.parse(response.text);
    const medicines = (Array.isArray(parsed.medicines) ? parsed.medicines : []).map((medicine) => {
      const confidence = Number.isFinite(Number(medicine.confidence))
        ? Math.min(1, Math.max(0, Number(medicine.confidence)))
        : 0;
      return {
        brand_name: String(medicine.brand_name ?? ""),
        strength: String(medicine.strength ?? ""),
        dosage_form: String(medicine.dosage_form ?? ""),
        frequency: String(medicine.frequency ?? ""),
        confidence,
        needs_confirmation: Boolean(medicine.needs_confirmation) || confidence < 0.85,
      };
    });
    res.json({
      status: "success",
      source,
      data: medicines,
    });
  } catch (err) {
    console.error("Prescription parse error:", err);
    if (ALLOW_ERROR_FALLBACK || DEMO_FALLBACK) {
      return res.json({
        status: "success",
        source: "error-fallback",
        disclaimer: "Sample extraction data only. This is not medical advice.",
        data: sampleMedicines,
      });
    }
    res.status(500).json({ error: "Failed to parse prescription", details: err.message });
  }
});

const PORT = process.env.PORT || 5002;
app.listen(PORT, () => {
  console.log(`Mehul's Prescription OCR Service running on port ${PORT}`);
});
