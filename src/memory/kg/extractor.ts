import type { DatabaseSync } from "node:sqlite";
import type { Entity, EntityType, Relation, RelationType, SourceType } from "./schema.js";
import { generateId } from "./schema.js";
import { recordProvenance, getDefaultTrustScore } from "../trust/provenance.js";

/**
 * Entity and relation extraction from text chunks.
 * Uses LLM-based extraction via OpenClaw's existing provider abstraction.
 *
 * TODO (Agent 1 - Phase 2):
 * - Implement LLM-based entity extraction
 * - Add relation extraction
 * - Consider GLiNER for faster local extraction
 */

export interface ExtractionResult {
  entities: ExtractedEntity[];
  relations: ExtractedRelation[];
}

export interface ExtractedEntity {
  name: string;
  type: EntityType;
  mentionText: string;
  startOffset?: number;
  endOffset?: number;
  confidence: number;
}

export interface ExtractedRelation {
  sourceEntityName: string;
  targetEntityName: string;
  relationType: RelationType;
  confidence: number;
}

export interface ExtractorOptions {
  db: DatabaseSync;
  sourceType: SourceType;
  trustScore?: number;
}

/**
 * Extracts entities and relations from a text chunk.
 * Placeholder implementation - will be filled in Phase 2.
 */
export async function extractFromChunk(
  _chunkId: string,
  _text: string,
  _options: ExtractorOptions,
): Promise<ExtractionResult> {
  // TODO: Implement LLM-based extraction
  // 1. Call LLM with structured output schema for entities/relations
  // 2. Resolve entities against existing canonical names
  // 3. Create entity mentions linking to chunk
  // 4. Return extraction result

  return {
    entities: [],
    relations: [],
  };
}

/**
 * Persists extracted entities to the database.
 * Handles deduplication via canonical name matching.
 */
export function persistEntities(
  db: DatabaseSync,
  entities: ExtractedEntity[],
  chunkId: string,
  sourceType: SourceType,
  trustScore: number = 0.5,
): Entity[] {
  const now = Date.now();
  const persisted: Entity[] = [];

  for (const extracted of entities) {
    // Check for existing entity by name (case-insensitive)
    const existing = db
      .prepare(
        `SELECT id, aliases FROM entities
         WHERE LOWER(name) = LOWER(?) OR LOWER(canonical_name) = LOWER(?)`,
      )
      .get(extracted.name, extracted.name) as { id: string; aliases: string } | undefined;

    let entityId: string;

    if (existing) {
      // Update existing entity's aliases if this is a new mention form
      entityId = existing.id;
      const aliases: string[] = JSON.parse(existing.aliases || "[]");
      if (!aliases.some((a) => a.toLowerCase() === extracted.name.toLowerCase())) {
        aliases.push(extracted.name);
        db.prepare(`UPDATE entities SET aliases = ?, updated_at = ? WHERE id = ?`).run(
          JSON.stringify(aliases),
          now,
          entityId,
        );
      }
    } else {
      // Create new entity
      entityId = generateId();
      db.prepare(
        `INSERT INTO entities (id, name, entity_type, canonical_name, aliases, trust_score, source_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        entityId,
        extracted.name,
        extracted.type,
        extracted.name.toLowerCase(),
        "[]",
        trustScore,
        sourceType,
        now,
        now,
      );

      persisted.push({
        id: entityId,
        name: extracted.name,
        entity_type: extracted.type,
        canonical_name: extracted.name.toLowerCase(),
        aliases: [],
        trust_score: trustScore,
        source_type: sourceType,
        created_at: now,
        updated_at: now,
      });
    }

    // Create entity mention linking to chunk
    const mentionId = generateId();
    db.prepare(
      `INSERT INTO entity_mentions (id, entity_id, chunk_id, mention_text, start_offset, end_offset, confidence)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      mentionId,
      entityId,
      chunkId,
      extracted.mentionText,
      extracted.startOffset ?? null,
      extracted.endOffset ?? null,
      extracted.confidence,
    );
  }

  return persisted;
}

/**
 * Persists extracted relations to the database.
 * Requires entities to already exist.
 */
export function persistRelations(
  db: DatabaseSync,
  relations: ExtractedRelation[],
  chunkId: string,
  sourceType: SourceType,
  trustScore: number = 0.5,
): Relation[] {
  const now = Date.now();
  const persisted: Relation[] = [];

  for (const extracted of relations) {
    // Look up source and target entities by name
    const sourceEntity = db
      .prepare(
        `SELECT id FROM entities WHERE LOWER(name) = LOWER(?) OR LOWER(canonical_name) = LOWER(?)`,
      )
      .get(extracted.sourceEntityName, extracted.sourceEntityName) as { id: string } | undefined;

    const targetEntity = db
      .prepare(
        `SELECT id FROM entities WHERE LOWER(name) = LOWER(?) OR LOWER(canonical_name) = LOWER(?)`,
      )
      .get(extracted.targetEntityName, extracted.targetEntityName) as { id: string } | undefined;

    if (!sourceEntity || !targetEntity) {
      // Skip relations where entities don't exist
      continue;
    }

    // Check for existing relation
    const existing = db
      .prepare(
        `SELECT id FROM relations
         WHERE source_entity_id = ? AND target_entity_id = ? AND relation_type = ?`,
      )
      .get(sourceEntity.id, targetEntity.id, extracted.relationType) as { id: string } | undefined;

    if (existing) {
      // Update confidence if new evidence is stronger
      db.prepare(`UPDATE relations SET confidence = MAX(confidence, ?) WHERE id = ?`).run(
        extracted.confidence,
        existing.id,
      );
      continue;
    }

    // Create new relation
    const relationId = generateId();
    db.prepare(
      `INSERT INTO relations (id, source_entity_id, target_entity_id, relation_type, confidence, source_chunk_id, trust_score, source_type, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      relationId,
      sourceEntity.id,
      targetEntity.id,
      extracted.relationType,
      extracted.confidence,
      chunkId,
      trustScore,
      sourceType,
      now,
    );

    persisted.push({
      id: relationId,
      source_entity_id: sourceEntity.id,
      target_entity_id: targetEntity.id,
      relation_type: extracted.relationType,
      confidence: extracted.confidence,
      source_chunk_id: chunkId,
      trust_score: trustScore,
      source_type: sourceType,
      created_at: now,
    });
  }

  return persisted;
}

/**
 * Indexed chunk information passed from the memory manager.
 */
export interface IndexedChunk {
  id: string;
  text: string;
  path: string;
  startLine: number;
  endLine: number;
}

type MemorySource = "memory" | "sessions";

/**
 * Maps memory source to provenance source type.
 * - "memory" files are user-curated → user_stated
 * - "sessions" are conversation transcripts → inferred
 */
function mapSourceType(source: MemorySource): SourceType {
  switch (source) {
    case "memory":
      return "user_stated";
    case "sessions":
      return "inferred";
    default:
      return "inferred";
  }
}

/**
 * Extracts and indexes entities from a batch of chunks.
 * Called from MemoryIndexManager.indexFile() after chunks are stored.
 *
 * This function:
 * 1. Records provenance for each chunk
 * 2. Extracts entities and relations from chunk text
 * 3. Persists entities, relations, and mentions to the KG tables
 */
export async function extractAndIndexEntities(
  db: DatabaseSync,
  chunks: IndexedChunk[],
  source: MemorySource,
): Promise<void> {
  const sourceType = mapSourceType(source);
  const trustScore = getDefaultTrustScore(sourceType);

  for (const chunk of chunks) {
    // Record provenance for this chunk
    recordProvenance(db, chunk.id, sourceType, chunk.path, trustScore);

    // Extract entities and relations from chunk text
    const result = await extractFromChunk(chunk.id, chunk.text, {
      db,
      sourceType,
      trustScore,
    });

    // Persist extracted entities (creates entity_mentions linking to chunk)
    if (result.entities.length > 0) {
      persistEntities(db, result.entities, chunk.id, sourceType, trustScore);
    }

    // Persist extracted relations
    if (result.relations.length > 0) {
      persistRelations(db, result.relations, chunk.id, sourceType, trustScore);
    }
  }
}
