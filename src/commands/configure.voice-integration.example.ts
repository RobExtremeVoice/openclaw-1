/**
 * Voice Configuration Integration Example
 *
 * This file shows how to integrate voice provider configuration
 * into the configure wizard. Add this to configure.wizard.ts
 * in the section handler logic.
 *
 * USAGE:
 * - Copy the promptVoiceConfig function into configure.wizard.ts
 * - Add case "voice": handler to the main switch statement
 * - This enables 'clawdbot configure voice' to work
 */

import type { ClawdbotConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { guardCancel } from "./onboard-helpers.js";
import { configureVoiceCommand } from "./voice.js";

/**
 * Handle voice configuration section
 *
 * Integration point for the configure wizard
 */
export async function promptVoiceConfig(
  nextConfig: ClawdbotConfig,
  prompter: WizardPrompter,
  runtime: RuntimeEnv,
): Promise<ClawdbotConfig> {
  return guardCancel(
    await configureVoiceCommand(nextConfig, prompter, runtime),
    runtime,
  );
}

/**
 * Add this to the section handler in configure.wizard.ts:
 *
 * ------ BEGIN ADDITION ------
 *
 * In the main switch statement that handles wizard sections:
 *
 *   case "voice":
 *     nextConfig = await promptVoiceConfig(nextConfig, prompter, runtime);
 *     break;
 *
 * ------ END ADDITION ------
 */

/**
 * Integration with configure.wizard.ts main flow:
 *
 * The voice section should be added to the configuration wizard loop.
 * This enables interactive voice setup when users select the voice option.
 *
 * Location: src/commands/configure.wizard.ts
 * Function: runConfigureWizard
 *
 * In the main wizard loop where other sections (model, web, gateway, etc)
 * are handled, add:
 *
 * ```typescript
 * case "voice":
 *   nextConfig = await promptVoiceConfig(nextConfig, prompter, runtime);
 *   break;
 * ```
 *
 * This enables the full integration of voice providers into the
 * configure wizard alongside existing configuration sections.
 */

/**
 * Additional Integration Points
 *
 * 1. Onboarding Flow
 *    - Voice provider setup can be included in the main onboarding
 *    - Add setupVoiceProviders() call in onboard sequence
 *    - Optional component (can be skipped)
 *
 * 2. Health Check
 *    - Add voice provider validation to health checks
 *    - Verify provider dependencies are installed
 *    - Test API key configuration for cloud providers
 *
 * 3. Configuration Validation
 *    - Validate voice config during loadClawdbotConfig
 *    - Warn about deprecated legacy settings
 *    - Suggest migration if legacy settings detected
 *
 * 4. CLI Commands
 *    - Register: clawdbot voice status
 *    - Register: clawdbot voice providers
 *    - Register: clawdbot voice test
 *    - These are already defined in voice.ts
 */
