import { Router } from "express";
import { z } from "zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import { requireAuth, requireCompany } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";

const router = Router();

const AISummaryBody = z.object({
  calculator: z.string(),
  inputs: z.record(z.string()),
  summary: z.string(),
  results: z.array(z.object({ label: z.string(), value: z.string(), highlight: z.boolean().optional() })),
});

// POST /calculators/ai-summary
router.post("/calculators/ai-summary", requireAuth, requireCompany, asyncHandler(async (req, res) => {
  const parsed = AISummaryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }

  const { calculator, inputs, summary, results } = parsed.data;

  const highlightedResults = results
    .filter((r) => r.highlight)
    .map((r) => `${r.label}: ${r.value}`)
    .join(", ");

  const prompt = `You are an experienced Canadian construction site foreman. A worker just ran the "${calculator}" calculator with these inputs: ${JSON.stringify(inputs)}. The key results are: ${highlightedResults}. Full summary: "${summary}"

Write a concise, plain-English field note (2-3 sentences) that a tradesperson would actually say on-site. Be practical and specific — mention the key numbers they need, any relevant safety or code notes for Canadian construction, and a brief next-step recommendation. Sound natural, not robotic. No bullet points.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
      temperature: 0.7,
    });

    const aiSummary = completion.choices[0]?.message?.content?.trim() ?? summary;
    res.json({ summary: aiSummary });
  } catch (err: any) {
    req.log.error({ err }, "Calculator AI summary error");
    res.status(500).json({ error: "AI generation failed" });
  }
}))

export default router;
