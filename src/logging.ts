export {
  enableConsoleCapture,
  getConsoleSettings,
  getResolvedConsoleSettings,
  routeLogsToStderr,
  setConsoleSubsystemFilter,
  setConsoleTimestampPrefix,
  shouldLogSubsystemToConsole,
} from "./logging/console.js";
export type { ConsoleLoggerSettings, ConsoleStyle } from "./logging/console.js";
export type { LogLevel } from "./logging/levels.js";
export { ALLOWED_LOG_LEVELS, levelToMinLevel, normalizeLogLevel } from "./logging/levels.js";
export {
  DEFAULT_LOG_DIR,
  DEFAULT_LOG_FILE,
  getChildLogger,
  getLogger,
  getResolvedLoggerSettings,
  isFileLogLevelEnabled,
  resetLogger,
  setLoggerOverride,
  toPinoLikeLogger,
} from "./logging/logger.js";
export type { LoggerResolvedSettings, LoggerSettings, PinoLikeLogger } from "./logging/logger.js";

// Re-export with local name to ensure hoisted function visibility within this module's own scope
// if it's imported back during the same execution turn.
export {
  createSubsystemLogger,
  createSubsystemRuntime,
  runtimeForLogger,
  stripRedundantSubsystemPrefixForConsole,
} from "./logging/subsystem.js";
export type { SubsystemLogger } from "./logging/subsystem.js";
