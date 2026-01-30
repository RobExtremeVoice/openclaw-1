/**
 * Self-Validation Loop Types for OpenClaw
 */

export type ValidationPhase = 1 | 2;
export type ValidationStatus = "PROGRESSING" | "STUCK" | "COMPLETE";
export type ValidationAction = "continue" | "retry" | "report" | "extend";

export interface ValidationCheck {
  timestamp: string;
  phase: ValidationPhase;
  iteration: number;
  screenshot_path: string;
  status: ValidationStatus;
  analysis_summary: string;
  action_taken?: ValidationAction;
}

export interface ValidationIssue {
  timestamp: string;
  description: string;
  resolution: string;
}

export interface SelfValidationState {
  active: boolean;
  phase: ValidationPhase;
  iteration_count: number;
  max_iterations: number;
  started_at: string;
  phase_2_started_at?: string;
  session_id: string;
  original_task: string;
  validation_history: ValidationCheck[];
  retry_count: number;
  max_retries: number;
  in_extension: boolean;
  extension_started_at?: string;
  last_screenshot_path?: string;
  last_status?: ValidationStatus;
  is_complete: boolean;
  completed_at?: string;
}

export interface StatusSummary {
  status: ValidationStatus;
  count: number;
  percentage: number;
}

export interface CompletionReport {
  task: string;
  started_at: string;
  completed_at: string;
  total_duration_minutes: number;
  validation_cycles: number;
  phase_1_cycles: number;
  phase_2_cycles: number;
  retry_attempts: number;
  issues_encountered: ValidationIssue[];
  status_history: StatusSummary[];
  final_status: "COMPLETE" | "TIMEOUT" | "MAX_RETRIES" | "USER_CANCELLED";
  full_history: ValidationCheck[];
}

export interface ScreenshotResult {
  path: string;
  success: boolean;
  error?: string;
}

export interface VisionAnalysisResult {
  status: ValidationStatus;
  summary: string;
  confidence?: number;
}
