import type { DatabaseSync } from "node:sqlite";
import type { Entity, EntityMention, Relation, RelationType } from "./schema.js";

/**
 * Knowledge Graph query interface.
 * Provides structured queries for entity and relation lookups.
 *
 * TODO (Agent 1 - Phase 2):
 * - Add graph traversal queries (N-hop neighbors)
 * - Implement path finding between entities
 * - Add aggregation queries (e.g., most connected entities)
 */

export interface EntityWithRelations extends Entity {
  outgoingRelations: Relation[];
  incomingRelations: Relation[];
  mentions: EntityMention[];
}

export interface QueryOptions {
  db: DatabaseSync;
  includeRelations?: boolean;
  includeMentions?: boolean;
  minTrustScore?: number;
}

/**
 * Finds an entity by name, canonical name, or alias.
 */
export function findEntity(
  name: string,
  options: QueryOptions,
): EntityWithRelations | null {
  const { db, includeRelations = false, includeMentions = false, minTrustScore = 0 } = options;

  // Try exact match first
  let entity = db
    .prepare(
      `SELECT * FROM entities
       WHERE (LOWER(name) = LOWER(?) OR LOWER(canonical_name) = LOWER(?))
       AND trust_score >= ?`,
    )
    .get(name, name, minTrustScore) as Entity | undefined;

  // Try alias match if no exact match
  if (!entity) {
    const allEntities = db
      .prepare(`SELECT * FROM entities WHERE trust_score >= ?`)
      .all(minTrustScore) as Entity[];

    for (const e of allEntities) {
      const aliases: string[] = JSON.parse((e.aliases as unknown as string) || "[]");
      if (aliases.some((a) => a.toLowerCase() === name.toLowerCase())) {
        entity = e;
        break;
      }
    }
  }

  if (!entity) return null;

  // Parse aliases from JSON string
  entity.aliases = JSON.parse((entity.aliases as unknown as string) || "[]");

  const result: EntityWithRelations = {
    ...entity,
    outgoingRelations: [],
    incomingRelations: [],
    mentions: [],
  };

  if (includeRelations) {
    result.outgoingRelations = db
      .prepare(`SELECT * FROM relations WHERE source_entity_id = ? AND trust_score >= ?`)
      .all(entity.id, minTrustScore) as Relation[];

    result.incomingRelations = db
      .prepare(`SELECT * FROM relations WHERE target_entity_id = ? AND trust_score >= ?`)
      .all(entity.id, minTrustScore) as Relation[];
  }

  if (includeMentions) {
    result.mentions = db
      .prepare(`SELECT * FROM entity_mentions WHERE entity_id = ?`)
      .all(entity.id) as EntityMention[];
  }

  return result;
}

/**
 * Finds all entities of a given type.
 */
export function findEntitiesByType(
  entityType: string,
  options: QueryOptions,
): Entity[] {
  const { db, minTrustScore = 0 } = options;

  const entities = db
    .prepare(`SELECT * FROM entities WHERE entity_type = ? AND trust_score >= ? ORDER BY name`)
    .all(entityType, minTrustScore) as Entity[];

  // Parse aliases for each entity
  return entities.map((e) => ({
    ...e,
    aliases: JSON.parse((e.aliases as unknown as string) || "[]"),
  }));
}

/**
 * Finds relations between two entities (by name or ID).
 */
export function findRelationsBetween(
  entity1: string,
  entity2: string,
  options: QueryOptions,
): Relation[] {
  const { db, minTrustScore = 0 } = options;

  // First resolve entity names to IDs
  const e1 = findEntity(entity1, { db });
  const e2 = findEntity(entity2, { db });

  if (!e1 || !e2) return [];

  return db
    .prepare(
      `SELECT * FROM relations
       WHERE ((source_entity_id = ? AND target_entity_id = ?)
          OR (source_entity_id = ? AND target_entity_id = ?))
       AND trust_score >= ?`,
    )
    .all(e1.id, e2.id, e2.id, e1.id, minTrustScore) as Relation[];
}

/**
 * Finds all entities related to a given entity via a specific relation type.
 */
export function findRelatedEntities(
  entityName: string,
  relationType: RelationType,
  direction: "outgoing" | "incoming" | "both",
  options: QueryOptions,
): Entity[] {
  const { db, minTrustScore = 0 } = options;

  const entity = findEntity(entityName, { db });
  if (!entity) return [];

  const relatedIds: Set<string> = new Set();

  if (direction === "outgoing" || direction === "both") {
    const outgoing = db
      .prepare(
        `SELECT target_entity_id FROM relations
         WHERE source_entity_id = ? AND relation_type = ? AND trust_score >= ?`,
      )
      .all(entity.id, relationType, minTrustScore) as Array<{ target_entity_id: string }>;

    outgoing.forEach((r) => relatedIds.add(r.target_entity_id));
  }

  if (direction === "incoming" || direction === "both") {
    const incoming = db
      .prepare(
        `SELECT source_entity_id FROM relations
         WHERE target_entity_id = ? AND relation_type = ? AND trust_score >= ?`,
      )
      .all(entity.id, relationType, minTrustScore) as Array<{ source_entity_id: string }>;

    incoming.forEach((r) => relatedIds.add(r.source_entity_id));
  }

  if (relatedIds.size === 0) return [];

  // Fetch full entity records
  const placeholders = Array.from(relatedIds).map(() => "?").join(",");
  const entities = db
    .prepare(`SELECT * FROM entities WHERE id IN (${placeholders}) AND trust_score >= ?`)
    .all(...relatedIds, minTrustScore) as Entity[];

  return entities.map((e) => ({
    ...e,
    aliases: JSON.parse((e.aliases as unknown as string) || "[]"),
  }));
}

/**
 * Searches entities by partial name match.
 */
export function searchEntities(
  query: string,
  options: QueryOptions & { limit?: number },
): Entity[] {
  const { db, minTrustScore = 0, limit = 10 } = options;

  const pattern = `%${query.toLowerCase()}%`;

  const entities = db
    .prepare(
      `SELECT * FROM entities
       WHERE (LOWER(name) LIKE ? OR LOWER(canonical_name) LIKE ?)
       AND trust_score >= ?
       ORDER BY trust_score DESC, name
       LIMIT ?`,
    )
    .all(pattern, pattern, minTrustScore, limit) as Entity[];

  return entities.map((e) => ({
    ...e,
    aliases: JSON.parse((e.aliases as unknown as string) || "[]"),
  }));
}

/**
 * Gets chunks associated with an entity via mentions.
 * Returns chunk IDs that can be used for context retrieval.
 */
export function getEntityChunks(entityName: string, options: QueryOptions): string[] {
  const { db } = options;

  const entity = findEntity(entityName, { db });
  if (!entity) return [];

  const mentions = db
    .prepare(`SELECT DISTINCT chunk_id FROM entity_mentions WHERE entity_id = ?`)
    .all(entity.id) as Array<{ chunk_id: string }>;

  return mentions.map((m) => m.chunk_id);
}
