import type { DatabaseSync } from "node:sqlite";
import type { SourceType } from "../kg/schema.js";
import { getProvenance, getDefaultTrustScore } from "./provenance.js";

/**
 * Trust score calculation and propagation.
 * Determines final trust scores based on source, verification, and context.
 *
 * TODO (Agent 2 - Phase 3):
 * - Implement trust propagation through relations
 * - Add time-decay for unverified content
 * - Support confidence intervals
 */

export interface TrustFactors {
  sourceType: SourceType;
  isVerified: boolean;
  hasHighTrustEvidence: boolean;
  contradictionCount: number;
  ageInDays: number;
}

export interface ScorerOptions {
  db: DatabaseSync;
  enableTimeDecay?: boolean;
  decayRatePerDay?: number;
}

/**
 * Calculates final trust score for a chunk based on multiple factors.
 */
export function calculateTrustScore(factors: TrustFactors): number {
  let score = getDefaultTrustScore(factors.sourceType);

  // Verification boost
  if (factors.isVerified) {
    score = Math.min(1.0, score + 0.3);
  }

  // High-trust evidence boost (corroboration)
  if (factors.hasHighTrustEvidence) {
    score = Math.min(1.0, score + 0.1);
  }

  // Contradiction penalty
  if (factors.contradictionCount > 0) {
    score = Math.max(0.1, score - 0.1 * factors.contradictionCount);
  }

  // Time decay (optional, for unverified content only)
  if (!factors.isVerified && factors.ageInDays > 30) {
    const decayFactor = Math.max(0.5, 1 - (factors.ageInDays - 30) * 0.01);
    score *= decayFactor;
  }

  return Math.round(score * 100) / 100; // Round to 2 decimal places
}

/**
 * Gets the effective trust score for a chunk, considering all factors.
 */
export function getEffectiveTrustScore(db: DatabaseSync, chunkId: string): number {
  const provenance = getProvenance(db, chunkId);
  if (!provenance) {
    return 0.1; // Minimum score for unknown provenance
  }

  const ageInMs = Date.now() - provenance.created_at;
  const ageInDays = ageInMs / (1000 * 60 * 60 * 24);

  const factors: TrustFactors = {
    sourceType: provenance.source_type,
    isVerified: provenance.verified_by_user,
    hasHighTrustEvidence: false, // TODO: Check for corroborating evidence
    contradictionCount: 0, // TODO: Count contradictions
    ageInDays,
  };

  return calculateTrustScore(factors);
}

/**
 * Re-ranks search results by trust score.
 * Higher trust scores float to the top while maintaining relevance ordering.
 */
export function trustWeightedRerank<T extends { chunkId: string; score: number }>(
  results: T[],
  options: ScorerOptions & { trustWeight?: number },
): T[] {
  const { db, trustWeight = 0.3 } = options;
  const relevanceWeight = 1 - trustWeight;

  return results
    .map((result) => {
      const trustScore = getEffectiveTrustScore(db, result.chunkId);
      const combinedScore = result.score * relevanceWeight + trustScore * trustWeight;
      return { ...result, combinedScore, trustScore };
    })
    .sort((a, b) => b.combinedScore - a.combinedScore);
}

/**
 * Filters results to only include chunks meeting minimum trust threshold.
 */
export function filterByTrust<T extends { chunkId: string }>(
  results: T[],
  db: DatabaseSync,
  minTrust: number,
): T[] {
  return results.filter((result) => {
    const trustScore = getEffectiveTrustScore(db, result.chunkId);
    return trustScore >= minTrust;
  });
}

/**
 * Updates trust score for a chunk in the provenance table.
 */
export function updateTrustScore(db: DatabaseSync, chunkId: string, newScore: number): boolean {
  const provenance = getProvenance(db, chunkId);
  if (!provenance) return false;

  const clampedScore = Math.max(0, Math.min(1, newScore));
  db.prepare(`UPDATE chunk_provenance SET trust_score = ? WHERE chunk_id = ?`).run(clampedScore, chunkId);

  return true;
}
