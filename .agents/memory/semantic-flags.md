---
name: Semantic Search Flag Accuracy
description: ragEnabled/semantic flags must track actual vector usage per query, not global config state.
---

## Problem
Multiple endpoints returned `semantic: embeddingsEnabled()` or `ragEnabled: true` based on whether the global embedding client was configured. This was misleading: a query could use full-text fallback (no vectors) while still reporting `semantic: true`.

## Rule
The `semantic` / `ragEnabled` flag must reflect whether **vector similarity search actually contributed results for this specific query**.

## How to apply
1. Change `hybridSearch()` to return both results and a `semantic: boolean` flag.
2. `semantic = true` only when `vectorSearch()` returned non-empty results.
3. Propagate this flag to all callers:
   - Document Q&A (`ragEnabled`)
   - Document search (`semantic`)
4. In fallback paths (no chunks at all, or full-text fallback), the flag should be `false`.

## Why
Frontend UI uses these flags to show badges like "Semantic search used" or "Full-text fallback." Accurate flags let users understand the system's state and take action (e.g., re-index documents) when semantic search is not actually working.
