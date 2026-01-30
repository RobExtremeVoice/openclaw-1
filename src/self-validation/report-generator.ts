import type { SelfValidationState, CompletionReport } from "./types.js";

export function generateCompletionReport(state: SelfValidationState): CompletionReport {
  const startedAt = new Date(state.started_at);
  const completedAt = state.completed_at ? new Date(state.completed_at) : new Date();

  const totalDurationMinutes = (completedAt.getTime() - startedAt.getTime()) / (1000 * 60);

  const phase1Cycles = state.validation_history.filter((h) => h.phase === 1).length;
  const phase2Cycles = state.validation_history.filter((h) => h.phase === 2).length;

  const statusCounts = state.validation_history.reduce(
    (acc, check) => {
      acc[check.status] = (acc[check.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const totalChecks = state.validation_history.length;
  const statusHistory = Object.entries(statusCounts).map(([status, count]) => ({
    status: status as "PROGRESSING" | "STUCK" | "COMPLETE",
    count,
    percentage: totalChecks > 0 ? Math.round((count / totalChecks) * 100) : 0,
  }));

  const issues = state.validation_history
    .filter((h) => h.status === "STUCK" && h.action_taken)
    .map((h) => ({
      timestamp: h.timestamp,
      description: h.analysis_summary,
      resolution: h.action_taken || "No action taken",
    }));

  let finalStatus: CompletionReport["final_status"] = "COMPLETE";
  if (!state.is_complete) {
    if (state.retry_count >= state.max_retries) {
      finalStatus = "MAX_RETRIES";
    } else {
      finalStatus = "TIMEOUT";
    }
  }

  return {
    task: state.original_task,
    started_at: state.started_at,
    completed_at: completedAt.toISOString(),
    total_duration_minutes: Math.round(totalDurationMinutes * 100) / 100,
    validation_cycles: state.iteration_count,
    phase_1_cycles: phase1Cycles,
    phase_2_cycles: phase2Cycles,
    retry_attempts: state.retry_count,
    issues_encountered: issues,
    status_history: statusHistory,
    final_status: finalStatus,
    full_history: state.validation_history,
  };
}

export function formatReportForUser(report: CompletionReport): string {
  return `
## Self-Validation Report

**Task:** ${report.task}

### Summary
- **Duration:** ${report.total_duration_minutes.toFixed(2)} minutes
- **Validation Cycles:** ${report.validation_cycles}
- **Final Status:** ${report.final_status}

### Breakdown
- Phase 1 (15s intervals): ${report.phase_1_cycles} checks
- Phase 2 (1min intervals): ${report.phase_2_cycles} checks
- Retry Attempts: ${report.retry_attempts}

### Status Distribution
${report.status_history.map((s) => `- ${s.status}: ${s.count} (${s.percentage}%)`).join("\n")}

### Issues Encountered
${
  report.issues_encountered.length > 0
    ? report.issues_encountered
        .map((i) => `- ${i.description} (Resolved: ${i.resolution})`)
        .join("\n")
    : "None"
}
`;
}
