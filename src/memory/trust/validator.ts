import type { DatabaseSync } from "node:sqlite";
import type { SourceType } from "../kg/schema.js";
import { getProvenance } from "./provenance.js";

/**
 * Security rule enforcement for memory content.
 * Validates that content doesn't violate trust boundaries.
 *
 * TODO (Agent 2 - Phase 3):
 * - Implement security directive detection
 * - Add content classification for sensitive patterns
 * - Support custom validation rules
 */

export interface ValidationResult {
  valid: boolean;
  warnings: ValidationWarning[];
  blocked: boolean;
  blockReason?: string;
}

export interface ValidationWarning {
  type: "security_directive" | "trust_mismatch" | "unverified_claim" | "potential_injection";
  message: string;
  severity: "low" | "medium" | "high";
  chunkId?: string;
}

export interface ValidatorOptions {
  db: DatabaseSync;
  strictMode?: boolean; // Block vs warn on security issues
}

// Patterns that indicate potential security directives or injection attempts
const SECURITY_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|directives|rules)/i,
  /disregard\s+(your|all|the)\s+(instructions|directives|rules)/i,
  /you\s+(must|should|will)\s+(always|never)\s+(say|do|respond|answer)/i,
  /override\s+(system|security|safety)\s+(settings|rules|directives)/i,
  /new\s+(system|admin|root)\s+(prompt|instruction|directive)/i,
  /\[SYSTEM\]/i,
  /\[ADMIN\]/i,
  /<system>/i,
  /```system/i,
];

// Patterns for potentially sensitive content
const SENSITIVE_PATTERNS = [
  /password\s*[:=]/i,
  /api[_-]?key\s*[:=]/i,
  /secret\s*[:=]/i,
  /token\s*[:=]/i,
  /credentials?\s*[:=]/i,
];

/**
 * Validates content before it's stored in memory.
 * Checks for security directives and injection attempts.
 */
export function validateContent(
  content: string,
  sourceType: SourceType,
  options: ValidatorOptions,
): ValidationResult {
  const { strictMode = false } = options;
  const warnings: ValidationWarning[] = [];
  let blocked = false;
  let blockReason: string | undefined;

  // External documents get extra scrutiny
  const isExternal = sourceType === "external_doc" || sourceType === "tool_result";

  // Check for security directive patterns
  for (const pattern of SECURITY_PATTERNS) {
    if (pattern.test(content)) {
      const warning: ValidationWarning = {
        type: "security_directive",
        message: `Potential security directive detected: ${pattern.source}`,
        severity: isExternal ? "high" : "medium",
      };
      warnings.push(warning);

      if (isExternal && strictMode) {
        blocked = true;
        blockReason = "External content contains potential security directive";
      }
    }
  }

  // Check for potential injection patterns
  if (content.includes("{{") || content.includes("${") || content.includes("<%")) {
    warnings.push({
      type: "potential_injection",
      message: "Content contains template syntax that could be injection",
      severity: isExternal ? "medium" : "low",
    });
  }

  // Check for sensitive patterns (warn but don't block)
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(content)) {
      warnings.push({
        type: "unverified_claim",
        message: `Content may contain sensitive information: ${pattern.source}`,
        severity: "medium",
      });
    }
  }

  return {
    valid: !blocked,
    warnings,
    blocked,
    blockReason,
  };
}

/**
 * Validates that a chunk meets minimum trust requirements for an operation.
 */
export function validateTrustLevel(
  db: DatabaseSync,
  chunkId: string,
  requiredTrust: number,
): ValidationResult {
  const provenance = getProvenance(db, chunkId);
  const warnings: ValidationWarning[] = [];

  if (!provenance) {
    return {
      valid: false,
      warnings: [
        {
          type: "trust_mismatch",
          message: "Chunk has no provenance record",
          severity: "high",
          chunkId,
        },
      ],
      blocked: true,
      blockReason: "No provenance record for chunk",
    };
  }

  if (provenance.trust_score < requiredTrust) {
    warnings.push({
      type: "trust_mismatch",
      message: `Chunk trust score ${provenance.trust_score} below required ${requiredTrust}`,
      severity: "medium",
      chunkId,
    });

    return {
      valid: false,
      warnings,
      blocked: false,
    };
  }

  return {
    valid: true,
    warnings,
    blocked: false,
  };
}

/**
 * Checks if content appears to contradict existing high-trust memories.
 * Returns warnings if contradictions are detected.
 */
export function checkContradictions(
  _db: DatabaseSync,
  _content: string,
  _options: ValidatorOptions,
): ValidationWarning[] {
  // TODO (Agent 2): Implement contradiction detection
  // 1. Extract key claims from content
  // 2. Search for related high-trust chunks
  // 3. Use LLM to detect contradictions
  // 4. Return warnings for conflicts
  return [];
}
