/**
 * Query intent classification for hybrid retrieval routing.
 * Determines the optimal retrieval strategy based on query patterns.
 *
 * TODO (Agent 3 - Phase 4):
 * - Implement embedding-based classification
 * - Add LLM fallback for ambiguous queries
 * - Support custom intent definitions
 */

export type QueryIntent =
  | "episodic" // "What did we discuss about X?"
  | "factual" // "What does X use/prefer?"
  | "relational" // "Who knows/works with X?"
  | "planning" // "How should we handle X given Y?"
  | "unknown";

export interface ClassificationResult {
  intent: QueryIntent;
  confidence: number;
  suggestedStrategy: RetrievalStrategy;
  extractedEntities: string[];
}

export type RetrievalStrategy = "vector_first" | "kg_first" | "hybrid" | "kg_only";

// Pattern-based intent classification rules
const INTENT_PATTERNS: Array<{ pattern: RegExp; intent: QueryIntent; strategy: RetrievalStrategy }> = [
  // Episodic - past discussions, events, context
  { pattern: /what\s+did\s+we\s+(discuss|talk|say)/i, intent: "episodic", strategy: "vector_first" },
  { pattern: /when\s+did\s+(we|I|you)/i, intent: "episodic", strategy: "vector_first" },
  { pattern: /last\s+time\s+we/i, intent: "episodic", strategy: "vector_first" },
  { pattern: /remember\s+when/i, intent: "episodic", strategy: "vector_first" },
  { pattern: /in\s+our\s+(previous|last|earlier)/i, intent: "episodic", strategy: "vector_first" },

  // Factual - preferences, properties, attributes
  { pattern: /what\s+(does|do|is)\s+\w+\s+(use|prefer|like|want)/i, intent: "factual", strategy: "kg_first" },
  { pattern: /what\s+is\s+\w+'?s?\s+(favorite|preferred)/i, intent: "factual", strategy: "kg_first" },
  { pattern: /how\s+does\s+\w+\s+(work|function)/i, intent: "factual", strategy: "hybrid" },
  { pattern: /what\s+are\s+the\s+(features|properties|attributes)/i, intent: "factual", strategy: "kg_first" },

  // Relational - connections between entities
  { pattern: /who\s+(knows|works|collaborates)/i, intent: "relational", strategy: "kg_first" },
  { pattern: /what\s+projects?\s+(involve|include|have)/i, intent: "relational", strategy: "kg_first" },
  { pattern: /is\s+\w+\s+(related|connected|linked)\s+to/i, intent: "relational", strategy: "kg_only" },
  { pattern: /relationship\s+between/i, intent: "relational", strategy: "kg_only" },
  { pattern: /how\s+(are|is)\s+\w+\s+(and|with)\s+\w+\s+related/i, intent: "relational", strategy: "kg_only" },

  // Planning - combining knowledge for decisions
  { pattern: /how\s+should\s+(we|I)\s+(handle|approach|deal)/i, intent: "planning", strategy: "hybrid" },
  { pattern: /what\s+(approach|strategy)\s+should/i, intent: "planning", strategy: "hybrid" },
  { pattern: /given\s+.+,?\s+(how|what)/i, intent: "planning", strategy: "hybrid" },
  { pattern: /considering\s+.+,?\s+(should|could)/i, intent: "planning", strategy: "hybrid" },
];

/**
 * Classifies a query's intent based on pattern matching.
 * Falls back to "unknown" with vector_first strategy for unmatched queries.
 */
export function classifyQuery(query: string): ClassificationResult {
  // Normalize query
  const normalizedQuery = query.trim().toLowerCase();

  // Try pattern matching
  for (const rule of INTENT_PATTERNS) {
    if (rule.pattern.test(normalizedQuery)) {
      return {
        intent: rule.intent,
        confidence: 0.8, // Pattern matches have high confidence
        suggestedStrategy: rule.strategy,
        extractedEntities: extractPotentialEntities(query),
      };
    }
  }

  // Default to unknown/vector_first for general queries
  return {
    intent: "unknown",
    confidence: 0.3,
    suggestedStrategy: "vector_first",
    extractedEntities: extractPotentialEntities(query),
  };
}

/**
 * Extracts potential entity names from a query.
 * Simple heuristic: capitalized words that aren't common English words.
 */
function extractPotentialEntities(query: string): string[] {
  const commonWords = new Set([
    "I",
    "We",
    "You",
    "The",
    "A",
    "An",
    "What",
    "Who",
    "When",
    "Where",
    "Why",
    "How",
    "Is",
    "Are",
    "Do",
    "Does",
    "Did",
    "Can",
    "Could",
    "Should",
    "Would",
    "Will",
    "Has",
    "Have",
    "Had",
  ]);

  // Find capitalized words that aren't at sentence start or common words
  const words = query.split(/\s+/);
  const entities: string[] = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/[^a-zA-Z]/g, "");
    if (word.length > 1 && word[0] === word[0].toUpperCase() && !commonWords.has(word)) {
      // Check if previous word suggests this isn't just sentence-initial cap
      if (i > 0 || words.length > 2) {
        entities.push(word);
      }
    }
  }

  return [...new Set(entities)];
}

/**
 * Enhanced classification using embedding similarity.
 * TODO (Agent 3): Implement embedding-based classification
 */
export async function classifyQueryWithEmbeddings(
  _query: string,
  _options?: { db?: unknown; embeddingProvider?: unknown },
): Promise<ClassificationResult> {
  // Placeholder - will use pre-computed intent embeddings for semantic matching
  // 1. Embed the query
  // 2. Compare against intent prototype embeddings
  // 3. Return best match with confidence

  // For now, fall back to pattern-based classification
  return classifyQuery(_query);
}
