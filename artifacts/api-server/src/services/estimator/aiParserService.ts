import { readFile as readFileAsync } from "fs/promises";
import { openai } from "@workspace/integrations-openai-ai-server";
import { BadRequestError } from "../../lib/errors";

// ── File Extraction — Uploaded File → Raw Text ───────────────────────────────

export async function extractTextFromUploadedFile(file: Express.Multer.File): Promise<string> {
  let extractedText: string;
  const mime = file.mimetype.toLowerCase();
  const filename = file.originalname.toLowerCase();

  // Read from temp disk file only when needed — never held in memory during upload
  const fileBuffer = await readFileAsync(file.path);

  if (mime.startsWith("image/") || /\.(png|jpg|jpeg|webp|heic)$/.test(filename)) {
    const base64 = fileBuffer.toString("base64");
    const dataUrl = `data:${file.mimetype};base64,${base64}`;
    const visionResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Analyze this construction plan or document image. Extract a detailed description of the project scope, including project type, approximate size in square feet, finish quality (basic/standard/premium/luxury), and any specific requirements visible. Be specific and comprehensive." },
          { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
        ],
      }],
    });
    extractedText = visionResponse.choices[0]?.message?.content ?? "";
    if (!extractedText) throw new BadRequestError("Could not extract information from the image");
  } else {
    let text: string | null = null;
    if (mime.includes("pdf") || filename.endsWith(".pdf")) {
      try {
        // @ts-ignore
        const pdfParse = (await import("pdf-parse")).default;
        const parsed = await pdfParse(fileBuffer);
        text = parsed.text?.trim() || null;
      } catch { text = null; }
    } else if (mime.includes("word") || mime.includes("docx") || filename.endsWith(".docx") || filename.endsWith(".doc")) {
      try {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        text = result.value?.trim() || null;
      } catch { text = null; }
    } else if (mime.startsWith("text/") || filename.endsWith(".txt")) {
      text = fileBuffer.toString("utf-8").trim();
    }
    if (!text || text.length < 10) {
      // OCR fallback for image-only PDFs
      if (mime.includes("pdf") || filename.endsWith(".pdf")) {
        try {
          const { convertPDFPagesToImages } = await import("../../lib/pdfOcr.js");
          const images = await convertPDFPagesToImages(fileBuffer, 3, 200);
          if (images.length > 0) {
            const visionContent: any = [
              { type: "text", text: "Analyze this construction plan or document image. Extract a detailed description of the project scope, including project type, approximate size in square feet, finish quality (basic/standard/premium/luxury), and any specific requirements visible. Be specific and comprehensive." },
            ];
            for (const img of images) {
              visionContent.push({
                type: "image_url",
                image_url: { url: `data:${img.mimeType};base64,${img.base64}`, detail: "high" },
              });
            }
            const visionResponse = await openai.chat.completions.create({
              model: "gpt-4o",
              max_completion_tokens: 2048,
              messages: [{ role: "user", content: visionContent }],
            });
            extractedText = visionResponse.choices[0]?.message?.content ?? "";
            if (extractedText) {
              // proceed with the OCR text below
            } else {
              throw new BadRequestError("Could not extract information from the scanned PDF");
            }
          } else {
            throw new BadRequestError("Could not extract readable text from the file. Please try a PDF, Word document, text file, or image.");
          }
        } catch {
          throw new BadRequestError("Could not extract readable text from the file. Please try a PDF, Word document, text file, or image.");
        }
      } else {
        throw new BadRequestError("Could not extract readable text from the file. Please try a PDF, Word document, text file, or image.");
      }
    } else {
      extractedText = text;
    }
  }

  return extractedText;
}

// ── AI Parser — Free Text → Structured JSON ───────────────────────────────────

const VALID_PROJECT_TYPES = [
  "residential_new_build", "commercial_new_build",
  "renovation_residential", "renovation_commercial",
  "addition", "garage", "deck_patio", "basement_finish",
  "roofing", "concrete_flatwork", "framing_only", "landscaping",
] as const;

const VALID_FINISH_LEVELS = ["basic", "standard", "premium", "luxury"] as const;

const VALID_ADDON_KEYS = [
  "hvac_system", "plumbing_rough", "electrical_panel", "insulation_spray_foam",
  "permit_fees", "engineered_drawings", "site_prep_excavation", "foundation_waterproofing",
  "hardwood_flooring", "custom_cabinetry", "solar_panels", "deck_addition",
  "window_upgrade", "smart_home", "radiant_floor_heat", "tankless_water_heater",
  "stamped_concrete", "basement_waterproofing",
];

export async function parsePromptToParams(prompt: string): Promise<{
  project_type: string;
  square_feet: number;
  finish_level: string;
  addons: string[];
  confidence: number;
  notes: string;
}> {
  const systemPrompt = `You are a construction estimating assistant. Extract structured parameters from a construction project description.

Return ONLY valid JSON with exactly these fields:
{
  "project_type": one of: ${VALID_PROJECT_TYPES.join(", ")},
  "square_feet": number (total project area in sqft, estimate if not given),
  "finish_level": one of: basic, standard, premium, luxury,
  "addons": array of applicable keys from: ${VALID_ADDON_KEYS.join(", ")},
  "confidence": number 0-100 (how confident you are in the extraction),
  "notes": "brief note about any assumptions made"
}

Rules:
- square_feet MUST be a number, never null. Estimate from context clues (room count, dimensions mentioned, typical sizes).
- finish_level: basic=builder-grade, standard=mid-range, premium=high-end, luxury=bespoke custom
- addons: only include if explicitly mentioned or strongly implied
- Do NOT invent values — if unsure about sqft, use 1000 as a reasonable default and set confidence low
- Respond with ONLY the JSON object, no markdown, no explanation`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 512,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content);

  // Validate and sanitize
  const projectType = VALID_PROJECT_TYPES.includes(parsed.project_type)
    ? parsed.project_type
    : "renovation_residential";
  const finishLevel = VALID_FINISH_LEVELS.includes(parsed.finish_level)
    ? parsed.finish_level
    : "standard";
  const sqft = Math.max(1, Math.round(Number(parsed.square_feet) || 1000));
  const addons = Array.isArray(parsed.addons)
    ? parsed.addons.filter((a: string) => VALID_ADDON_KEYS.includes(a))
    : [];

  return {
    project_type: projectType,
    square_feet: sqft,
    finish_level: finishLevel,
    addons,
    confidence: Math.min(100, Math.max(0, Number(parsed.confidence) || 50)),
    notes: String(parsed.notes || ""),
  };
}
