import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();
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

const ai = new GoogleGenAI({
  vertexai: true,
  project: process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
});

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

    const response = await ai.models.generateContent({
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
    });

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
      source: "gemini-enterprise-multimodal",
      data: medicines,
    });
  } catch (err) {
    console.error("Prescription parse error:", err);
    if (ALLOW_ERROR_FALLBACK) {
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
