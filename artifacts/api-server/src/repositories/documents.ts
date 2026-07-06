import { db, projectDocumentsTable, projectsTable, costAnalysesTable, pool } from "@workspace/db";
import { eq, and } from "drizzle-orm";

export type ProjectDocument = typeof projectDocumentsTable.$inferSelect;

export type ChunkResult = {
  doc_id: number; chunk_index: number; content: string;
  similarity: number; filename: string; file_type: string;
};

// ── Projects ───────────────────────────────────────────────────────────────────

export async function getProjectCompanyId(projectId: number): Promise<number | null> {
  const [project] = await db
    .select({ companyId: projectsTable.companyId })
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId))
    .limit(1);
  return project?.companyId ?? null;
}

export async function getProjectCompanyAndName(
  projectId: number,
): Promise<{ name: string | null; companyId: number } | undefined> {
  const [project] = await db
    .select({ name: projectsTable.name, companyId: projectsTable.companyId })
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId));
  return project;
}

// ── Document CRUD ───────────────────────────────────────────────────────────────

export async function listDocumentsForProject(projectId: number): Promise<ProjectDocument[]> {
  return db
    .select()
    .from(projectDocumentsTable)
    .where(eq(projectDocumentsTable.projectId, projectId))
    .orderBy(projectDocumentsTable.createdAt);
}

export async function getChunkCountsByDoc(projectId: number): Promise<Record<number, number>> {
  const counts = await pool.query<{ doc_id: number; cnt: string }>(
    "SELECT doc_id, COUNT(*) AS cnt FROM document_chunks WHERE project_id=$1 GROUP BY doc_id",
    [projectId]
  );
  return Object.fromEntries(counts.rows.map((r) => [r.doc_id, parseInt(r.cnt)]));
}

export async function insertDocument(data: typeof projectDocumentsTable.$inferInsert): Promise<ProjectDocument> {
  const [doc] = await db.insert(projectDocumentsTable).values(data).returning();
  return doc;
}

export async function getDocument(docId: number, projectId: number): Promise<ProjectDocument | undefined> {
  const [doc] = await db
    .select()
    .from(projectDocumentsTable)
    .where(and(eq(projectDocumentsTable.id, docId), eq(projectDocumentsTable.projectId, projectId)));
  return doc;
}

export async function deleteDocument(docId: number, projectId: number): Promise<void> {
  await db
    .delete(projectDocumentsTable)
    .where(and(eq(projectDocumentsTable.id, docId), eq(projectDocumentsTable.projectId, projectId)));
}

export async function updateDocument(
  docId: number,
  projectId: number,
  fields: Partial<typeof projectDocumentsTable.$inferInsert>,
): Promise<ProjectDocument | undefined> {
  const [updated] = await db
    .update(projectDocumentsTable)
    .set(fields)
    .where(and(eq(projectDocumentsTable.id, docId), eq(projectDocumentsTable.projectId, projectId)))
    .returning();
  return updated;
}

// ── Chunks ─────────────────────────────────────────────────────────────────────

// Used before re-chunking a doc (storeChunks) — scoped by doc + company only.
export async function deleteChunksByDocAndCompany(docId: number, companyId: number): Promise<void> {
  await pool.query("DELETE FROM document_chunks WHERE doc_id = $1 AND company_id = $2", [docId, companyId]);
}

// Used when a document is deleted outright — scoped by doc + project + company.
export async function deleteChunksByDocProjectCompany(
  docId: number,
  projectId: number,
  companyId: number,
): Promise<void> {
  await pool.query(
    "DELETE FROM document_chunks WHERE doc_id=$1 AND project_id=$2 AND company_id=$3",
    [docId, projectId, companyId],
  );
}

export async function bulkInsertChunksWithEmbeddings(
  projectId: number,
  companyId: number,
  docId: number,
  chunks: string[],
  embeddings: number[][],
): Promise<void> {
  const valuePlaceholders = chunks.map(
    (_, i) => `($${i * 6 + 1},$${i * 6 + 2},$${i * 6 + 3},$${i * 6 + 4},$${i * 6 + 5},$${i * 6 + 6}::vector)`
  ).join(",");
  const values = chunks.flatMap((chunk, i) => [
    projectId, companyId, docId, i, chunk, JSON.stringify(embeddings[i])
  ]);
  await pool.query(
    `INSERT INTO document_chunks (project_id, company_id, doc_id, chunk_index, content, embedding) VALUES ${valuePlaceholders}`,
    values
  );
}

export async function bulkInsertChunksNoEmbeddings(
  projectId: number,
  companyId: number,
  docId: number,
  chunks: string[],
): Promise<void> {
  const valuePlaceholders = chunks.map(
    (_, i) => `($${i * 5 + 1},$${i * 5 + 2},$${i * 5 + 3},$${i * 5 + 4},$${i * 5 + 5})`
  ).join(",");
  const values = chunks.flatMap((chunk, i) => [projectId, companyId, docId, i, chunk]);
  await pool.query(
    `INSERT INTO document_chunks (project_id, company_id, doc_id, chunk_index, content) VALUES ${valuePlaceholders}`,
    values
  );
}

export async function vectorSearchQuery(
  projectId: number,
  companyId: number,
  queryVec: string,
  limit: number,
): Promise<ChunkResult[]> {
  const result = await pool.query<ChunkResult>(
    `SELECT dc.doc_id, dc.chunk_index, dc.content,
       (1 - (dc.embedding <=> $1::vector))::float AS similarity,
       pd.filename, pd.file_type
     FROM document_chunks dc
     JOIN project_documents pd ON dc.doc_id = pd.id
     WHERE dc.project_id = $2
       AND dc.company_id = $3
       AND dc.embedding IS NOT NULL
     ORDER BY dc.embedding <=> $1::vector
     LIMIT $4`,
    [queryVec, projectId, companyId, limit]
  );
  return result.rows;
}

export async function ftsWebsearchQuery(
  projectId: number,
  companyId: number,
  query: string,
  limit: number,
): Promise<ChunkResult[]> {
  const result = await pool.query<ChunkResult>(
    `SELECT dc.doc_id, dc.chunk_index, dc.content,
       ts_rank(to_tsvector('english', dc.content), websearch_to_tsquery('english', $1))::float AS similarity,
       pd.filename, pd.file_type
     FROM document_chunks dc
     JOIN project_documents pd ON dc.doc_id = pd.id
     WHERE dc.project_id = $2
       AND dc.company_id = $3
       AND to_tsvector('english', dc.content) @@ websearch_to_tsquery('english', $1)
     ORDER BY similarity DESC
     LIMIT $4`,
    [query, projectId, companyId, limit]
  );
  return result.rows;
}

export async function ftsPlainQuery(
  projectId: number,
  companyId: number,
  query: string,
  limit: number,
): Promise<ChunkResult[]> {
  const result = await pool.query<ChunkResult>(
    `SELECT dc.doc_id, dc.chunk_index, dc.content,
       ts_rank(to_tsvector('english', dc.content), plainto_tsquery('english', $1))::float AS similarity,
       pd.filename, pd.file_type
     FROM document_chunks dc
     JOIN project_documents pd ON dc.doc_id = pd.id
     WHERE dc.project_id = $2
       AND dc.company_id = $3
       AND to_tsvector('english', dc.content) @@ plainto_tsquery('english', $1)
     ORDER BY similarity DESC
     LIMIT $4`,
    [query, projectId, companyId, limit]
  );
  return result.rows;
}

export async function ftsIlikeQuery(
  projectId: number,
  companyId: number,
  query: string,
  limit: number,
): Promise<ChunkResult[]> {
  const result = await pool.query<ChunkResult>(
    `SELECT dc.doc_id, dc.chunk_index, dc.content,
       0.1::float AS similarity,
       pd.filename, pd.file_type
     FROM document_chunks dc
     JOIN project_documents pd ON dc.doc_id = pd.id
     WHERE dc.project_id = $1
       AND dc.company_id = $2
       AND dc.content ILIKE $3
     LIMIT $4`,
    [projectId, companyId, `%${query}%`, limit]
  );
  return result.rows;
}

export async function getChunkCountForProject(projectId: number): Promise<number> {
  const row = await pool.query<{ cnt: string }>(
    "SELECT COUNT(*)::text AS cnt FROM document_chunks WHERE project_id = $1",
    [projectId]
  );
  return parseInt(row.rows[0]?.cnt ?? "0");
}

export async function getChunkedDocIds(projectId: number, docIds: number[]): Promise<Set<number>> {
  const row = await pool.query<{ doc_id: number }>(
    `SELECT DISTINCT doc_id FROM document_chunks WHERE project_id = $1 AND doc_id = ANY($2)`,
    [projectId, docIds]
  );
  return new Set(row.rows.map((r) => r.doc_id));
}

// ── Cost analyses ────────────────────────────────────────────────────────────

export async function insertCostAnalysis(data: typeof costAnalysesTable.$inferInsert) {
  const [entry] = await db.insert(costAnalysesTable).values(data).returning();
  return entry;
}
