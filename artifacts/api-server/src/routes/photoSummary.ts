import { Router } from "express";
import { z } from "zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import { requireAuth, requireCompany } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";

const router = Router();

const PhotoSummaryInput = z.object({
  images: z
    .array(
      z.object({
        base64: z.string(),
        mimeType: z.string().default("image/jpeg"),
      }),
    )
    .min(1)
    .max(8),
  projectName: z.string().optional(),
  context: z.string().optional(),
});

/**
 * POST /ai/photo-summary
 *
 * Accepts up to 8 site photos as base64 and returns an AI-generated
 * structured analysis: overall summary, progress observations, safety flags,
 * materials spotted, and action items.
 */
router.post(
  "/ai/photo-summary",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const parsed = PhotoSummaryInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
      return;
    }

    const { images, projectName, context } = parsed.data;

    const projectLine = projectName ? `Project: ${projectName}` : "Project: (not specified)";
    const contextLine = context ? `Additional context from the worker: ${context}` : "";

    const systemPrompt = `You are an expert construction site AI analyst for Canadian construction projects. 
You analyze site photos and provide professional, actionable insights for project managers, foremen, and owners.
Be concise, specific, and use construction industry terminology.`;

    const userPrompt = `Analyze these ${images.length} construction site photo(s) and return ONLY a JSON object.
${projectLine}
${contextLine}

Return this exact JSON shape (no markdown, no extra text):
{
  "summary": "2-3 sentence overall summary of site conditions and progress visible in the photos",
  "progress": ["observation 1", "observation 2"],
  "safetyFlags": ["safety concern 1 or empty array if none"],
  "materialsSpotted": ["material or equipment 1"],
  "weatherConditions": "describe visible weather/site conditions, or null if indoors/unclear",
  "recommendations": ["action item 1", "action item 2"],
  "confidence": "high" | "medium" | "low"
}`;

    const imageContent = images.map((img) => ({
      type: "image_url" as const,
      image_url: {
        url: `data:${img.mimeType};base64,${img.base64}`,
        detail: "high" as const,
      },
    }));

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 2048,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [{ type: "text", text: userPrompt }, ...imageContent],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "{}";

    let result: Record<string, unknown>;
    try {
      result = JSON.parse(raw);
    } catch {
      result = {
        summary: "Analysis complete — could not parse structured response.",
        progress: [],
        safetyFlags: [],
        materialsSpotted: [],
        weatherConditions: null,
        recommendations: [],
        confidence: "low",
      };
    }

    res.json({
      summary: result.summary ?? null,
      progress: Array.isArray(result.progress) ? result.progress : [],
      safetyFlags: Array.isArray(result.safetyFlags) ? result.safetyFlags : [],
      materialsSpotted: Array.isArray(result.materialsSpotted) ? result.materialsSpotted : [],
      weatherConditions: result.weatherConditions ?? null,
      recommendations: Array.isArray(result.recommendations) ? result.recommendations : [],
      confidence: result.confidence ?? "medium",
      imageCount: images.length,
    });
  }),
);

export default router;
