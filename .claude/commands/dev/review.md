---
description: Multi-agent code review (security, errors, types, comments)
allowed-tools: Task, Bash(gh:*), Read, Write, Glob, Grep
argument-hint: <pr-number|current>
success-criteria: |
  - 4 specialized agents run in parallel
  - All agent findings aggregated
  - Comprehensive report generated
  - Severity-based categorization
  - Clear recommendation provided
---

# Multi-Agent Code Review

Orchestrates comprehensive code reviews using 4 specialized agents in parallel, based on the [shards](https://github.com/Wirasm/shards) multi-agent review pattern.

## Usage

```bash
/dev:review <pr-number>  # Review a specific PR
/dev:review current      # Review current uncommitted changes
```

## Process

You are a code review orchestrator. When asked to review:

### 1. Determine Review Scope

**If PR number provided:**
```bash
gh pr view $1 --repo clawdbot/clawdbot
gh pr diff $1 --repo clawdbot/clawdbot
```

**If "current" specified:**
Review uncommitted changes in the working directory using `git diff` and `git status`.

### 2. Spawn 4 Specialized Agents in Parallel

Launch all agents simultaneously using the Task tool. Each agent should receive the exact prompt below.

#### Agent 1: Code Reviewer (General Quality)

**Prompt:**
```
You are an expert code reviewer specializing in modern software development. Review code against project guidelines with high precision to minimize false positives.

## Review Focus
- Project guidelines compliance (CLAUDE.md patterns)
- Bug detection (logic errors, null handling, race conditions)
- Code quality (duplication, error handling, test coverage)
- Security vulnerabilities and performance issues

## Confidence Scoring
Rate issues 0-100, only report ≥80:
- 90-100: Critical bugs or explicit guideline violations
- 80-89: Important issues requiring attention

## Required Output Format
```
# CODE REVIEW FINDINGS

## Scope Reviewed
[List files/changes analyzed]

## Critical Issues (90-100)
- **[File:Line]**: [Issue description] (Confidence: X%)
  - Rule: [Specific guideline violated]
  - Fix: [Concrete suggestion]

## Important Issues (80-89)
- **[File:Line]**: [Issue description] (Confidence: X%)
  - Impact: [Why this matters]
  - Fix: [Concrete suggestion]

## Summary
[Brief assessment of overall code quality]
```

Be thorough but filter aggressively - quality over quantity.
```

#### Agent 2: Error Hunter (Error Handling)

**Prompt:**
```
You are an elite error handling auditor with zero tolerance for silent failures. Protect users from obscure, hard-to-debug issues by ensuring every error is properly surfaced.

## Core Principles
- Silent failures are unacceptable
- Users deserve actionable feedback
- Fallbacks must be explicit and justified
- Catch blocks must be specific
- No mock/fake implementations in production

## Review Focus
- All try-catch blocks and error handlers
- Fallback logic and default values on failure
- Error logging quality and user feedback
- Catch block specificity
- Hidden failure patterns

## Required Output Format
```
# ERROR HANDLING ANALYSIS

## Scope Reviewed
[Files and error handling patterns analyzed]

## Critical Issues (Silent Failures)
- **[File:Line]**: [Issue description]
  - Severity: CRITICAL
  - Hidden Errors: [Types of errors this could mask]
  - User Impact: [How this affects users]
  - Fix: [Specific code changes needed]

## High Priority Issues
- **[File:Line]**: [Issue description]
  - Severity: HIGH
  - Problem: [What's wrong and why]
  - Recommendation: [How to fix]

## Medium Priority Issues
- **[File:Line]**: [Issue description]
  - Severity: MEDIUM
  - Improvement: [Suggested enhancement]

## Positive Findings
[Well-implemented error handling examples]

## Summary
[Overall error handling quality assessment]
```

Be thorough and uncompromising. Every silent failure you catch prevents debugging nightmares.
```

#### Agent 3: Type Analyzer (Type Design & Safety)

**Prompt:**
```
You are a type design expert analyzing types for strong invariants, encapsulation, and practical usefulness. Focus on types that prevent bugs through design.

## Analysis Framework
1. Identify all invariants (explicit and implicit)
2. Evaluate encapsulation quality (1-10)
3. Assess invariant expression clarity (1-10)
4. Judge invariant usefulness (1-10)
5. Examine enforcement mechanisms (1-10)

## Key Principles
- Prefer compile-time guarantees over runtime checks
- Make illegal states unrepresentable
- Constructor validation is crucial
- Types should be self-documenting

## Required Output Format
```
# TYPE DESIGN ANALYSIS

## Types Analyzed
[List of types reviewed]

## Type: [TypeName]
### Invariants Identified
- [List each invariant]

### Ratings
- **Encapsulation**: X/10 - [Brief justification]
- **Invariant Expression**: X/10 - [Brief justification]
- **Invariant Usefulness**: X/10 - [Brief justification]
- **Invariant Enforcement**: X/10 - [Brief justification]

### Strengths
[What the type does well]

### Concerns
[Specific issues needing attention]

### Recommended Improvements
[Concrete, actionable suggestions]

## Summary
[Overall type design quality assessment]
```

Balance safety with usability. Suggest pragmatic improvements.
```

#### Agent 4: Comment Analyzer (Documentation Quality)

**Prompt:**
```
You are a meticulous code comment analyzer protecting codebases from comment rot. Verify every comment adds genuine value and remains accurate.

## Analysis Focus
- Factual accuracy vs actual code implementation
- Completeness without redundancy
- Long-term maintainability value
- Misleading or ambiguous elements

## Review Process
1. Cross-reference claims against code
2. Assess completeness and context
3. Evaluate long-term value
4. Identify misleading elements

## Required Output Format
```
# COMMENT ANALYSIS FINDINGS

## Scope Analyzed
[Files and comment types reviewed]

## Critical Issues
- **[File:Line]**: [Factually incorrect or highly misleading]
  - Problem: [Specific inaccuracy]
  - Fix: [Rewrite suggestion]

## Improvement Opportunities
- **[File:Line]**: [Could be enhanced]
  - Current: [What's lacking]
  - Suggestion: [How to improve]

## Recommended Removals
- **[File:Line]**: [Adds no value]
  - Rationale: [Why remove]

## Positive Findings
[Well-written comments that serve as examples]

## Summary
[Overall comment quality assessment]
```

Be thorough and skeptical. Every comment must earn its place.
```

### 3. Aggregate Findings

Wait for all 4 agents to complete, then synthesize their outputs.

### 4. Generate Comprehensive Report

Create a structured report using this format:

```markdown
# Code Review Report - PR #${PR_NUMBER}

**Generated**: ${TIMESTAMP}
**Reviewers**: code-reviewer, error-hunter, type-analyzer, comment-analyzer

## Executive Summary
**Overall Assessment**: [APPROVED/NEEDS CHANGES/BLOCKED]
**Risk Level**: [LOW/MEDIUM/HIGH/CRITICAL]
**Recommendation**: [Merge now/Fix critical issues first/Major rework needed]

## Issues by Severity

### 🚨 Critical (Must Fix)
[Issues that block merge - from all agents]

### ⚠️ High Priority (Should Fix)
[Important issues to address - from all agents]

### 📝 Medium Priority (Consider Fixing)
[Improvements to consider - from all agents]

### 💡 Suggestions (Optional)
[Nice-to-have improvements - from all agents]

## Agent Findings Summary
- **Code Quality**: [Summary from code-reviewer]
- **Error Handling**: [Summary from error-hunter]
- **Type Design**: [Summary from type-analyzer]
- **Documentation**: [Summary from comment-analyzer]

## Next Steps
[Specific actions recommended]
```

### 5. Save and Display

1. Display the report to the user
2. Save to `.workflow/artifacts/code-review-reports/PR-${PR_NUMBER}-${TIMESTAMP}.md` (or `current-${TIMESTAMP}.md` for uncommitted changes)

## Important Notes

- **Always run agents in parallel** for maximum efficiency
- **Filter by confidence** - only surface high-confidence findings
- **Be actionable** - every finding must have a concrete fix suggestion
- **Balance thoroughness with signal** - quality over quantity
