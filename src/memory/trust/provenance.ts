import type { DatabaseSync } from "node:sqlite";
import type { SourceType } from "../kg/schema.js";

/**
 * Provenance tracking for memory chunks.
 * Records where each piece of information came from and its trust level.
 *
 * TODO (Agent 2 - Phase 3):
 * - Implement source tracking on ingest
 * - Add audit logging for provenance changes
 * - Support provenance inheritance for derived chunks
 */

export interface ChunkProvenance {
  chunk_id: string;
  source_type: SourceType;
  trust_score: number;
  source_uri: string | null;
  created_at: number;
  verified_by_user: boolean;
  verification_timestamp: number | null;
}

/**
 * Ensures provenance tracking table exists in the database.
 * Should be called after ensureMemoryIndexSchema() and ensureKGSchema().
 */
export function ensureProvenanceSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chunk_provenance (
      chunk_id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,
      trust_score REAL DEFAULT 0.5,
      source_uri TEXT,
      created_at INTEGER NOT NULL,
      verified_by_user INTEGER DEFAULT 0,
      verification_timestamp INTEGER,
      FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
    );
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_provenance_source_type ON chunk_provenance(source_type);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_provenance_trust ON chunk_provenance(trust_score);`);
}

/**
 * Records provenance for a chunk.
 * Called during chunk ingestion.
 */
export function recordProvenance(
  db: DatabaseSync,
  chunkId: string,
  sourceType: SourceType,
  sourceUri?: string,
  trustScore?: number,
): ChunkProvenance {
  const now = Date.now();
  const score = trustScore ?? getDefaultTrustScore(sourceType);

  db.prepare(
    `INSERT OR REPLACE INTO chunk_provenance
     (chunk_id, source_type, trust_score, source_uri, created_at, verified_by_user)
     VALUES (?, ?, ?, ?, ?, 0)`,
  ).run(chunkId, sourceType, score, sourceUri ?? null, now);

  return {
    chunk_id: chunkId,
    source_type: sourceType,
    trust_score: score,
    source_uri: sourceUri ?? null,
    created_at: now,
    verified_by_user: false,
    verification_timestamp: null,
  };
}

/**
 * Gets provenance for a chunk.
 */
export function getProvenance(db: DatabaseSync, chunkId: string): ChunkProvenance | null {
  const row = db.prepare(`SELECT * FROM chunk_provenance WHERE chunk_id = ?`).get(chunkId) as
    | (Omit<ChunkProvenance, "verified_by_user"> & { verified_by_user: number })
    | undefined;

  if (!row) return null;

  return {
    ...row,
    verified_by_user: row.verified_by_user === 1,
  };
}

/**
 * Marks a chunk as verified by the user.
 * Increases trust score and records verification timestamp.
 */
export function verifyChunk(
  db: DatabaseSync,
  chunkId: string,
  trustBoost: number = 0.3,
): boolean {
  const existing = getProvenance(db, chunkId);
  if (!existing) return false;

  const newScore = Math.min(1.0, existing.trust_score + trustBoost);
  const now = Date.now();

  db.prepare(
    `UPDATE chunk_provenance
     SET verified_by_user = 1, verification_timestamp = ?, trust_score = ?
     WHERE chunk_id = ?`,
  ).run(now, newScore, chunkId);

  return true;
}

/**
 * Gets default trust score based on source type.
 * External documents are capped at 0.3 for security.
 */
export function getDefaultTrustScore(sourceType: SourceType): number {
  switch (sourceType) {
    case "user_stated":
      return 0.9;
    case "inferred":
      return 0.5;
    case "external_doc":
      return 0.3; // Security cap - never trust external content highly
    case "tool_result":
      return 0.4;
    default:
      return 0.5;
  }
}
