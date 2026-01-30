import { useCallback } from "react";
import { useGateway } from "../context/GatewayContext.js";
import type { Message } from "./useChat.js";
import { spawn } from "node:child_process";

export const useCommands = (
  sessionKey: string,
  addMessage: (msg: Message) => void,
  refreshSessionInfo: () => Promise<void>,
) => {
  const gateway = useGateway();

  const handleLocalShell = useCallback(
    async (line: string) => {
      const cmd = line.slice(1);
      addMessage({ id: Math.random().toString(), role: "system", content: `[local] $ ${cmd}` });

      return new Promise<void>((resolve) => {
        const child = spawn(cmd, { shell: true });
        let output = "";

        child.stdout.on("data", (data) => {
          output += data.toString();
        });
        child.stderr.on("data", (data) => {
          output += data.toString();
        });

        child.on("close", (code) => {
          addMessage({
            id: Math.random().toString(),
            role: "system",
            content: output.trim() || `Exit code: ${code}`,
          });
          resolve();
        });
      });
    },
    [addMessage],
  );

  const handleSlashCommand = useCallback(
    async (text: string) => {
      const parts = text.slice(1).split(" ");
      const command = parts[0];
      const args = parts.slice(1).join(" ");

      switch (command) {
        case "reset":
          await gateway.resetSession(sessionKey);
          addMessage({ id: Math.random().toString(), role: "system", content: "Session reset." });
          break;
        case "model":
          if (args) {
            await gateway.patchSession({ key: sessionKey, model: args });
            addMessage({
              id: Math.random().toString(),
              role: "system",
              content: `Model set to ${args}`,
            });
            await refreshSessionInfo();
          }
          break;
        default:
          addMessage({
            id: Math.random().toString(),
            role: "system",
            content: `Unknown command: /${command}`,
          });
      }
    },
    [gateway, sessionKey, addMessage, refreshSessionInfo],
  );

  return { handleLocalShell, handleSlashCommand };
};
