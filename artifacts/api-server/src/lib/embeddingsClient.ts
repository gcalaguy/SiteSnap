import OpenAI from "openai";
import { logger } from "./logger.js";

let _embeddingsClient: OpenAI | null = null;

function getEmbeddingsClient(): OpenAI | null {
  if (_embeddingsClient) return _embeddingsClient;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === "_DUMMY_API_KEY_" || apiKey.length < 20) {
    logger.warn(
      "OPENAI_API_KEY is not set or invalid. Vector embeddings will be skipped — falling back to full-text search only. " +
        "Set OPENAI_API_KEY to enable semantic search."
    );
    return null;
  }

  _embeddingsClient = new OpenAI({ apiKey });
  return _embeddingsClient;
}

export function embeddingsEnabled(): boolean {
  return getEmbeddingsClient() !== null;
}

/**
 * Generate embeddings for a batch of text chunks.
 * Returns an array of 1536-dimension vectors aligned with the input chunks.
 * If the client is unavailable, returns null.
 */
export async function generateEmbeddings(
  chunks: string[]
): Promise<number[][] | null> {
  const client = getEmbeddingsClient();
  if (!client || chunks.length === 0) return null;

  try {
    const response = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: chunks,
    });

    const vectors = response.data.map((d: { embedding: number[] }) => d.embedding);
    if (vectors.length !== chunks.length) {
      logger.warn(
        { expected: chunks.length, received: vectors.length },
        "Embedding count mismatch"
      );
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
