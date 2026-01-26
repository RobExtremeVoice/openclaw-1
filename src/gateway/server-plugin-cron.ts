/**
 * Plugin cron job integration.
 * Discovers and registers cron jobs from plugins that expose a `*.getCronJobs` gateway method.
 */

import type { CronService } from "../cron/service.js";
import type { CronJobCreate } from "../cron/types.js";
import type { GatewayRequestHandler } from "./server-methods/types.js";

type PluginCronResult = {
  jobs?: CronJobCreate[];
};

/**
 * Call a plugin gateway handler that returns cron jobs.
 * Plugin handlers may either:
 * 1. Return the result directly (simpler pattern used by some plugins)
 * 2. Call respond() with the result (standard gateway handler pattern)
 *
 * This helper supports both patterns.
 */
async function callCronJobsHandler(handler: GatewayRequestHandler): Promise<PluginCronResult> {
  return new Promise((resolve) => {
    let resolved = false;

    // Create a respond function that captures the result
    const respond = (ok: boolean, payload?: unknown) => {
      if (!resolved) {
        resolved = true;
        resolve(ok ? (payload as PluginCronResult) : { jobs: [] });
      }
    };

    // Create minimal mock options for the handler
    const mockOpts = {
      req: { type: "req" as const, method: "getCronJobs", id: "plugin-cron-init" },
      params: {},
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as never, // Handlers that need context won't work, but getCronJobs doesn't need it
    };

    // Call the handler - it may return a value or call respond()
    const result = handler(mockOpts);

    // Handle direct return value (async or sync)
    if (result instanceof Promise) {
      result
        .then((value) => {
          if (!resolved && value !== undefined) {
            resolved = true;
            resolve(value as PluginCronResult);
          } else if (!resolved) {
            // Handler completed without returning or calling respond - return empty
            resolved = true;
            resolve({ jobs: [] });
          }
        })
        .catch(() => {
          if (!resolved) {
            resolved = true;
            resolve({ jobs: [] });
          }
        });
    } else if (!resolved && result !== undefined) {
      // Sync handler returned a value
      resolved = true;
      resolve(result as PluginCronResult);
    }

    // Fallback timeout in case handler doesn't respond
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({ jobs: [] });
      }
    }, 5000);
  });
}

/**
 * Discovers and registers cron jobs from plugins.
 * Looks for gateway methods matching the pattern `*.getCronJobs` and calls them
 * to retrieve cron job configurations, then registers those jobs with the cron service.
 *
 * @param params.cron - The cron service to register jobs with
 * @param params.handlers - Plugin gateway handlers to scan for getCronJobs methods
 * @param params.log - Logger for status messages
 */
export async function loadPluginCronJobs(params: {
  cron: CronService;
  handlers: Record<string, GatewayRequestHandler>;
  log: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
}): Promise<void> {
  const { cron, handlers, log } = params;

  // Find all handlers matching *.getCronJobs pattern
  const cronMethods = Object.entries(handlers).filter(([method]) =>
    method.endsWith(".getCronJobs"),
  );

  if (cronMethods.length === 0) {
    return;
  }

  let totalJobs = 0;

  for (const [method, handler] of cronMethods) {
    const pluginId = method.replace(".getCronJobs", "");
    try {
      // Call the gateway method to get cron jobs
      const result = await callCronJobsHandler(handler);
      const jobs = result?.jobs;

      if (!Array.isArray(jobs) || jobs.length === 0) {
        continue;
      }

      // Register each job with the cron service
      for (const job of jobs) {
        try {
          // Check if job already exists (by name)
          const existing = await cron.list();
          const existingJob = existing.find((j) => j.name === job.name);

          if (existingJob) {
            // Update existing job schedule if it changed
            if (
              JSON.stringify(existingJob.schedule) !== JSON.stringify(job.schedule) ||
              existingJob.enabled !== job.enabled
            ) {
              await cron.update(existingJob.id, {
                schedule: job.schedule,
                enabled: job.enabled,
              });
            }
          } else {
            // Add new job
            await cron.add(job);
            totalJobs++;
          }
        } catch (err) {
          log.warn(`[${pluginId}] failed to register cron job "${job.name}": ${String(err)}`);
        }
      }
    } catch (err) {
      log.error(`[${pluginId}] getCronJobs failed: ${String(err)}`);
    }
  }

  if (totalJobs > 0) {
    log.info(`registered ${totalJobs} cron job(s) from plugins`);
  }
}
