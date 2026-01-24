import type { ClawdbotConfig } from "../config/types.js";

export type CommandScope = "text" | "native" | "both";

export type CommandArgType = "string" | "number" | "boolean";

export type CommandArgChoiceContext = {
  cfg?: ClawdbotConfig;
  provider?: string;
  model?: string;
  command: ChatCommandDefinition;
  arg: CommandArgDefinition;
};

/** A choice can be a plain string or an object with separate value and display label. */
export type CommandArgChoice = string | { value: string; label: string };

/** Normalized choice with both value and label always present. */
export type ResolvedCommandArgChoice = { value: string; label: string };

export type CommandArgChoicesProvider = (context: CommandArgChoiceContext) => CommandArgChoice[];

export type CommandArgDefinition = {
  name: string;
  description: string;
  type: CommandArgType;
  required?: boolean;
  choices?: CommandArgChoice[] | CommandArgChoicesProvider;
  captureRemaining?: boolean;
};

export type CommandArgMenuSpec = {
  arg: string;
  title?: string;
};

export type CommandArgValue = string | number | boolean | bigint;
export type CommandArgValues = Record<string, CommandArgValue>;

export type CommandArgs = {
  raw?: string;
  values?: CommandArgValues;
};

export type CommandArgsParsing = "none" | "positional";

export type ChatCommandDefinition = {
  key: string;
  nativeName?: string;
  description: string;
  textAliases: string[];
  acceptsArgs?: boolean;
  args?: CommandArgDefinition[];
  argsParsing?: CommandArgsParsing;
  formatArgs?: (values: CommandArgValues) => string | undefined;
  argsMenu?: CommandArgMenuSpec | "auto";
  scope: CommandScope;
};

export type NativeCommandSpec = {
  name: string;
  description: string;
  acceptsArgs: boolean;
  args?: CommandArgDefinition[];
};

export type CommandNormalizeOptions = {
  botUsername?: string;
};

export type CommandDetection = {
  exact: Set<string>;
  regex: RegExp;
};

export type ShouldHandleTextCommandsParams = {
  cfg: ClawdbotConfig;
  surface: string;
  commandSource?: "text" | "native";
};
