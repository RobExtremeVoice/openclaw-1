---
status: resolved
priority: p1
issue_id: 005
tags: [code-review, data-integrity, concurrency, file-handling]
dependencies: []
resolution: implemented
resolved_at: 2026-01-15
---

# Race Condition in Sidecar File Creation

## Problem Statement

**What's broken/missing:**
`persistTranscript()` and `persistDescription()` write sidecar files using non-atomic `fs.writeFile()` operations. Concurrent processing of the same media file can cause:
- Partial writes interleaved between processes
- Truncated content if one process completes mid-write
- Data corruption with incomplete UTF-8 sequences

**Why it matters:**
- Webhook retries or duplicate messages can process same media simultaneously
- Process crashes during write leave partial files
- Sidecar files are used for debugging and potential caching - corruption breaks both

**Current behavior:**
```typescript
// Non-atomic write
await fs.writeFile(sidecarPath, transcript, "utf8");
```

## Findings

**Source:** data-integrity-guardian (agent a0a0681)

**Evidence:**
- `src/transcription/index.ts:71-84` - Non-atomic `persistTranscript()`
- `src/video-understanding/index.ts:72-85` - Non-atomic `persistDescription()`
- No file locking or atomic write pattern
- No checks for existing files before writing

**Data corruption scenarios:**
1. **Concurrent processing:** Same media processed twice → both write to same file
2. **Interrupted write:** Process killed during write → partial UTF-8 sequences
3. **Last-write-wins:** No detection of concurrent modifications

## Proposed Solutions

### Solution 1: Atomic Write with Temp File + Rename (Recommended)
**Approach:**
Write to temporary file first, then atomically rename to final location. POSIX guarantees atomic rename.

**Implementation:**
```typescript
import crypto from "node:crypto";

async function persistTranscript(
  audioPath: string,
  transcript: string,
): Promise<void> {
  const sidecarPath = `${audioPath}.transcript.txt`;
  const tempPath = `${sidecarPath}.tmp.${crypto.randomUUID()}`;

  try {
    // Write to temp file
    await fs.writeFile(tempPath, transcript, "utf8");

    // Atomic rename
    await fs.rename(tempPath, sidecarPath);

    if (shouldLogVerbose()) {
      logVerbose(`Saved transcript sidecar: ${sidecarPath}`);
    }
  } catch (err) {
    logVerbose(`Failed to save transcript sidecar: ${String(err)}`);

    // Clean up temp file
    await fs.rm(tempPath, { force: true }).catch(() => {});
  }
}
```

**Pros:**
- POSIX atomic rename guarantees no partial writes visible
- Standard pattern for atomic file operations
- Handles concurrent writes safely (last one wins atomically)
- Clean temp file cleanup on error

**Cons:**
- Requires additional temp file
- Slightly more complex than direct write
- Still no detection of concurrent modifications (but safe)

**Effort:** Small (1-2 hours)
**Risk:** Low
**Expected improvement:** Eliminates data corruption from partial writes

### Solution 2: File Locking with `proper-lockfile`
**Approach:**
Use exclusive locks before writing sidecar files.

**Pros:**
- Prevents concurrent writes completely
- Can detect and wait for locks

**Cons:**
- External dependency
- Lock files need cleanup
- Adds latency if waiting for lock
- Overkill for this use case

**Effort:** Medium (3-4 hours)
**Risk:** Low

### Solution 3: Check-Before-Write with Timestamp
**Approach:**
Check if sidecar already exists and is recent, skip write if so.

**Pros:**
- Avoids duplicate work
- Simple logic

**Cons:**
- Not atomic (race condition between check and write)
- Doesn't prevent corruption, just reduces likelihood
- Time-based logic is fragile

**Effort:** Small (1 hour)
**Risk:** Medium (doesn't fully solve the problem)

## Recommended Action

**Decision pending triage**

**Recommendation:** Solution 1 (atomic write) - industry standard pattern, simple, effective.

Apply to both:
- `src/transcription/index.ts:persistTranscript()`
- `src/video-understanding/index.ts:persistDescription()`

## Technical Details

**Affected files:**
- `src/transcription/index.ts:71-84`
- `src/video-understanding/index.ts:72-85`

**Atomic rename guarantees (POSIX):**
- Rename is atomic if both paths are on same filesystem
- If target exists, it's atomically replaced
- No partial state visible to other processes
- Safe even with concurrent renames to same target

**Error scenarios to handle:**
1. Filesystem full (ENOSPC) - cleanup temp, log error
2. Permission denied (EACCES) - cleanup temp, log error
3. Cross-device rename (EXDEV) - fallback to copy+delete

## Acceptance Criteria

- [x] `persistTranscript()` uses atomic write pattern
- [x] `persistDescription()` uses atomic write pattern
- [x] Temp file uses unique random suffix (UUID)
- [x] Failed writes clean up temp files
- [x] Error logging includes error type and path
- [x] Unit tests verify atomic behavior
- [x] Unit test simulates concurrent writes (no corruption)
- [x] Unit test verifies cleanup on error

## Work Log

### 2026-01-15 (Resolution)
- **Implemented Solution 1:** Atomic write with temp file + rename pattern
- **Created shared utility:** `src/utils/atomic-write.ts` with `atomicWriteFile()` function
- **Updated files:**
  - `src/transcription/index.ts:persistTranscript()` - now uses atomic writes
  - `src/video-understanding/index.ts:persistDescription()` - now uses atomic writes
- **Tests added:** 9 comprehensive unit tests in `src/utils/atomic-write.test.ts`
  - Atomic write behavior verification
  - Concurrent writes handling (last-write-wins safely)
  - Temp file cleanup on error
  - UTF-8 encoding preservation
  - Large file handling (1MB+)
  - Edge cases (empty files, nonexistent paths)
- **Test results:** All 9 tests passing
- **Commit:** 8f3f54554 "fix(media): use atomic writes for sidecar files to prevent race conditions"
- **Resolution:** Data corruption risk eliminated via POSIX atomic rename

### 2026-01-15 (Finding)
- **Finding created** from PR #719 code review (workflows:review agent)
- **Identified by:** data-integrity-guardian (agent a0a0681)
- **Severity:** P1 - Data corruption risk
- **Location:** Sidecar persistence functions in both modules

## Resources

- **PR:** #719
- **Related code:**
  - `src/transcription/index.ts:71-84`
  - `src/video-understanding/index.ts:72-85`
- **Pattern reference:** POSIX atomic file operations
- **Node.js docs:** `fs.rename()` atomicity guarantees
- **Similar pattern:** Check if exists in codebase (grep for `.tmp.` or `writeFile.*rename`)
