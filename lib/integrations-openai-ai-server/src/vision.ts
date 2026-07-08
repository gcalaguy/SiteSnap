import type OpenAI from "openai";
import { openai } from "./client";

export type VisionImage = { mimeType: string; base64: string };

function toImageContent(images: VisionImage[]): OpenAI.Chat.Completions.ChatCompletionContentPart[] {
  return images.map((img) => ({
    type: "image_url" as const,
    image_url: { url: `data:${img.mimeType};base64,${img.base64}`, detail: "high" as const },
  }));
}

/**
 * Calls the model with a text prompt and optional images, JSON.parse-ing the
 * response with a typed fallback on malformed output. Centralizes the
 * base64/image_url payload shape and parse-with-fallback boilerplate shared
 * by every OCR/document-analysis call site (receipt OCR, document analysis,
 * estimate photo parsing).
 */
export async function extractJson<T>(params: {
  prompt: string;
  images?: VisionImage[];
  model?: string;
  maxTokens?: number;
  systemPrompt?: string;
  jsonMode?: boolean;
  fallback: T;
}): Promise<T> {
  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: "text", text: params.prompt },
    ...(params.images ? toImageContent(params.images) : []),
  ];

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    ...(params.systemPrompt ? [{ role: "system" as const, content: params.systemPrompt }] : []),
    { role: "user", content },
  ];

  const response = await openai.chat.completions.create({
    model: params.model ?? "gpt-5.4",
    max_completion_tokens: params.maxTokens ?? 2048,
    messages,
    ...(params.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
  });

  const text = response.choices[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(text) as T;
  } catch {
    return params.fallback;
  }
}

/**
 * Calls the model with a text prompt and images, returning the raw text
 * response verbatim (no JSON parsing) — used for straight OCR transcription
 * rather than structured extraction.
 */
export async function extractText(params: {
  prompt: string;
  images: VisionImage[];
  model?: string;
  maxTokens?: number;
}): Promise<string> {
  const response = await openai.chat.completions.create({
    model: params.model ?? "gpt-5.4",
    max_completion_tokens: params.maxTokens ?? 2048,
    messages: [{ role: "user", content: [{ type: "text", text: params.prompt }, ...toImageContent(params.images)] }],
  });
  return response.choices[0]?.message?.content ?? "";
}
