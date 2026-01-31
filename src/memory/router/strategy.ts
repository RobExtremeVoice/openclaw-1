import type { DatabaseSync } from "node:sqlite";
import type { RetrievalStrategy, ClassificationResult } from "./classifier.js";

/**
 * Retrieval strategy selection and execution.
 * Routes queries to the appropriate search path based on intent.
 *
 * TODO (Agent 3 - Phase 4):
 * - Implement KG-first retrieval path
 * - Add query expansion with entity aliases
 * - Integrate with existing hybrid.ts for vector/BM25
 */

export interface StrategyOptions {
  db: DatabaseSync;
  maxResults?: number;
  minScore?: number;
  minTrustScore?: number;
}

export interface SearchResult {
  chunkId: string;
  text: string;
  score: number;
  path: string;
  source: string;
  trustScore?: number;
  entities?: string[];
}

export interface StrategyResult {
  results: SearchResult[];
  strategy: RetrievalStrategy;
  expandedQueries?: string[];
  kgContext?: KGContext;
}

export interface KGContext {
  relevantEntities: Array<{ id: string; name: string; type: string }>;
  relations: Array<{ source: string; relation: string; target: string }>;
}

/**
 * Selects the optimal retrieval strategy based on classification.
 */
export function selectStrategy(classification: ClassificationResult): RetrievalStrategy {
  // Use suggested strategy from classification by default
  let strategy = classification.suggestedStrategy;

  // Override for low-confidence classifications
  if (classification.confidence < 0.5 && classification.intent !== "unknown") {
    // Fall back to hybrid for uncertain classifications
    strategy = "hybrid";
  }

  // If entities were detected, prefer strategies that use KG
  if (classification.extractedEntities.length > 0 && strategy === "vector_first") {
    strategy = "hybrid";
  }

  return strategy;
}

/**
 * Executes the retrieval strategy and returns results.
 * Placeholder implementation - will be filled by Agent 3.
 */
export async function executeStrategy(
  query: string,
  classification: ClassificationResult,
  _options: StrategyOptions,
): Promise<StrategyResult> {
  const strategy = selectStrategy(classification);

  // TODO (Agent 3): Implement strategy execution
  // 1. For kg_first/kg_only: Query KG for relevant entities/relations
  // 2. For vector_first: Use existing hybrid search
  // 3. For hybrid: Combine both approaches

  // Placeholder - returns empty results
  return {
    results: [],
    strategy,
    expandedQueries: expandQueryWithAliases(query, classification.extractedEntities, { db: _options.db }),
    kgContext: undefined,
  };
}

/**
 * Expands a query with entity aliases from the KG.
 * Returns additional query variants to search.
 */
export function expandQueryWithAliases(
  query: string,
  entities: string[],
  _options: { db: DatabaseSync },
): string[] {
  const expandedQueries: string[] = [query];

  // TODO (Agent 3): Look up aliases for each entity
  // For each entity in the query:
  // 1. Find the entity in the KG
  // 2. Get its aliases
  // 3. Generate query variants with aliases substituted

  // For now, just return the original query
  if (entities.length > 0) {
    // Placeholder: Would expand "Tom" to also search "Thomas", etc.
  }

  return expandedQueries;
}

/**
 * Merges results from multiple retrieval strategies.
 * Handles deduplication and re-scoring.
 */
export function mergeStrategyResults(
  vectorResults: SearchResult[],
  kgResults: SearchResult[],
  weights: { vectorWeight: number; kgWeight: number },
): SearchResult[] {
  const { vectorWeight, kgWeight } = weights;
  const resultMap = new Map<string, SearchResult>();

  // Add vector results
  for (const result of vectorResults) {
    resultMap.set(result.chunkId, {
      ...result,
      score: result.score * vectorWeight,
    });
  }

  // Merge KG results
  for (const result of kgResults) {
    const existing = resultMap.get(result.chunkId);
    if (existing) {
      // Boost score for results found by both methods
      existing.score += result.score * kgWeight;
      if (result.entities) {
        existing.entities = [...(existing.entities || []), ...result.entities];
      }
    } else {
      resultMap.set(result.chunkId, {
        ...result,
        score: result.score * kgWeight,
      });
    }
  }

  // Sort by combined score
  return Array.from(resultMap.values()).sort((a, b) => b.score - a.score);
}

/**
 * Builds KG context for a set of entities.
 * Returns relevant entities and their relations.
 */
export function buildKGContext(
  _entities: string[],
  _options: { db: DatabaseSync; maxHops?: number },
): KGContext {
  // TODO (Agent 3): Implement KG context building
  // 1. Find entities by name in KG
  // 2. Get their immediate relations
  // 3. Optionally traverse N hops for broader context
  // 4. Return structured context

  return {
    relevantEntities: [],
    relations: [],
  };
}
