/**
 * Tavily web search client with built-in guardrails:
 * - Max 3 results per query (API-level)
 * - Snippets truncated to 500 characters each
 * - Graceful fallback when TAVILY_API_KEY is missing
 */

import axios from "axios";
import { logger } from "./logger.js";

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const TAVILY_SEARCH_URL = "https://api.tavily.com/search";

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string; // truncated to 500 chars
  score: number;
}

export interface WebSearchResponse {
  query: string;
  results: WebSearchResult[];
}

/** Check whether Tavily is configured. */
export function webSearchEnabled(): boolean {
  return !!TAVILY_API_KEY && TAVILY_API_KEY.startsWith("tvly-");
}

/**
 * Search the web via Tavily.
 * - Returns top 3 results
 * - Each snippet is capped at 500 characters
 * - Returns empty array on any failure (no throwing to callers)
 */
export async function searchWeb(query: string): Promise<WebSearchResult[]> {
  if (!webSearchEnabled()) {
    logger.debug("Tavily API key not configured; skipping web search.");
    return [];
  }

  try {
    const { data } = await axios.post<{
      query: string;
      results: Array<{ title: string; url: string; content: string; score: number }>;
    }>(
      TAVILY_SEARCH_URL,
      {
        api_key: TAVILY_API_KEY,
        query: query.trim(),
        search_depth: "basic",
        max_results: 3,
        include_answer: false,
        include_images: false,
        include_raw_content: false,
      },
      { timeout: 8000 },
    );

    const results = (data.results ?? []).map((r) => ({
      title: r.title ?? "Untitled",
      url: r.url ?? "",
      snippet: trunc(r.content ?? "", 500),
      score: r.score ?? 0,
    }));

    logger.info(
      { query, resultCount: results.length },
      "Tavily web search completed",
    );
    return results;
  } catch (err: any) {
    logger.warn(
      { err: err.message, status: err.response?.status },
      "Tavily web search failed",
    );
    return [];
  }
}

/** Format search results into a compact string for injection into an AI prompt. */
export function formatSearchContext(results: WebSearchResult[]): string {
  if (results.length === 0) return "";
  const lines = results.map(
    (r, i) =>
      `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`,
  );
  return `\n--- WEB SEARCH RESULTS ---\n${lines.join("\n\n")}\n---\n`;
}

function trunc(s: string, max: number): string {
  if (!s) return "";
  return s.length > max ? s.slice(0, max) + "\u2026" : s;
}
