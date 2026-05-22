import OpenAI from "openai";
import { logger } from "./logger.js";

// Use the Replit-managed OpenAI AI Integration proxy (same credentials as the rest of the AI stack).
// This ensures embeddings are always available whenever the integration is configured.
const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

let _client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (_client) return _client;

  if (!baseURL || !apiKey || apiKey === "_DUMMY_API_KEY_" || apiKey.length < 20) {
    logger.warn(
      "AI_INTEGRATIONS_OPENAI_BASE_URL or API_KEY is not set. " +
        "Vector embeddings are disabled — semantic search will fall back to full-text only. " +
        "Provision the OpenAI AI Integration to enable semantic search."
    );
    return null;
  }

  _client = new OpenAI({ apiKey, baseURL });
  return _client;
}

export function embeddingsEnabled(): boolean {
  return getClient() !== null;
}

/**
 * Generate embeddings for a batch of text chunks.
 * Returns an array of vectors aligned with the input chunks.
 * If the client is unavailable or the call fails, returns null so callers
 * can decide whether to proceed or abort.
 */
export async function generateEmbeddings(
  chunks: string[]
): Promise<number[][] | null> {
  const client = getClient();
  if (!client || chunks.length === 0) return null;

  try {
    const response = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: chunks,
    });

    const vectors = response.data.map((d: { embedding: number[] }) => d.embedding);
    if (vectors.length !== chunks.length) {
      logger.error(
        { expected: chunks.length, received: vectors.length },
        "Embedding count mismatch from API"
      );
      return null; // signal failure so caller can abort
    }
    return vectors;
  } catch (err: any) {
    logger.error(
      { err: err.message, status: err.status, code: err.code },
      "Embedding generation failed"
    );
    return null;
  }
}
