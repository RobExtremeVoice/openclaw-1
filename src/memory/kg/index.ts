/**
 * Knowledge Graph module for RAG/KG memory system.
 *
 * This module provides:
 * - Schema definitions and database initialization (schema.ts)
 * - Entity/relation extraction from text (extractor.ts)
 * - Entity canonicalization and deduplication (resolver.ts)
 * - Structured KG queries (query.ts)
 */

// Schema and types
export {
  ensureKGSchema,
  generateId,
  type Entity,
  type EntityMention,
  type EntityType,
  type Relation,
  type RelationType,
  type SourceType,
} from "./schema.js";

// Entity/relation extraction
export {
  extractFromChunk,
  persistEntities,
  persistRelations,
  type ExtractionResult,
  type ExtractedEntity,
  type ExtractedRelation,
  type ExtractorOptions,
} from "./extractor.js";

// Entity resolution
export {
  resolveEntity,
  mergeEntities,
  findPotentialDuplicates,
  type ResolverOptions,
  type ResolutionResult,
} from "./resolver.js";

// KG queries
export {
  findEntity,
  findEntitiesByType,
  findRelationsBetween,
  findRelatedEntities,
  searchEntities,
  getEntityChunks,
  type EntityWithRelations,
  type QueryOptions,
} from "./query.js";
