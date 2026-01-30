import { useState, useEffect, useCallback } from "react";
import { useGateway } from "../context/GatewayContext.js";
import { TuiStreamAssembler } from "../../tui/tui-stream-assembler.js";
import { extractThinkingFromMessage, extractContentFromMessage } from "../../tui/tui-formatters.js";
import type { ChatEvent, AgentEvent, SessionInfo } from "../../tui/tui-types.js";

export type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  thinking?: string;
  isFinal?: boolean;
  tools?: ToolCall[];
};

export type ToolCall = {
  id: string;
  name: string;
  args?: any;
  result?: any;
  isError?: boolean;
  isStreaming?: boolean;
};

export const useChat = (initialSessionKey: string) => {
  const gateway = useGateway();
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionKey, setSessionKey] = useState(initialSessionKey);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "running" | "streaming" | "error">("idle");
  const [sessionInfo, setSessionInfo] = useState<SessionInfo>({});

  const refreshSessionInfo = useCallback(async () => {
    try {
      const statusRes = (await gateway.getStatus()) as any;
      if (statusRes?.sessions?.recent) {
        const current = statusRes.sessions.recent.find((s: any) => s.key === sessionKey);
        if (current) {
          setSessionInfo(current);
        }
      }
    } catch (err) {
      console.error("Failed to refresh session info", err);
    }
  }, [gateway, sessionKey]);

  useEffect(() => {
    const assembler = new TuiStreamAssembler();

    gateway.onEvent = (evt) => {
      if (evt.event === "chat.event") {
        const payload = evt.payload as ChatEvent;
        if (payload.sessionKey !== sessionKey) return;

        if (payload.state === "delta") {
          assembler.ingestDelta(payload.runId, payload.message, true);
          const thinking = extractThinkingFromMessage(payload.message);
          const content = extractContentFromMessage(payload.message);

          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.id === payload.runId) {
              return [
                ...prev.slice(0, -1),
                {
                  ...last,
                  content: last.content + (content || ""),
                  thinking: last.thinking + (thinking || ""),
                },
              ];
            }
            return [
              ...prev,
              {
                id: payload.runId,
                role: "assistant",
                content: content || "",
                thinking: thinking || "",
              },
            ];
          });
          setStatus("streaming");
        } else if (payload.state === "final") {
          assembler.finalize(payload.runId, payload.message, true);
          const thinking = extractThinkingFromMessage(payload.message);
          const content = extractContentFromMessage(payload.message);

          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.id === payload.runId) {
              return [
                ...prev.slice(0, -1),
                {
                  ...last,
                  content: content || last.content,
                  thinking: thinking || last.thinking,
                  isFinal: true,
                },
              ];
            }
            return [
              ...prev,
              {
                id: payload.runId,
                role: "assistant",
                content: content || "",
                thinking: thinking || "",
                isFinal: true,
              },
            ];
          });
          setActiveRunId(null);
          setStatus("idle");
          void refreshSessionInfo();
        } else if (payload.state === "error") {
          setStatus("error");
          setActiveRunId(null);
          void refreshSessionInfo();
        }
      } else if (evt.event === "agent.event") {
        const payload = evt.payload as AgentEvent;
        if (payload.stream === "tool") {
          const data = payload.data as any;
          const { phase, toolCallId, name: toolName } = data;

          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (!last || last.role !== "assistant") return prev;

            const tools = last.tools || [];
            let nextTools = [...tools];

            if (phase === "start") {
              nextTools.push({
                id: toolCallId,
                name: toolName,
                args: data.args,
                isStreaming: true,
              });
            } else if (phase === "update") {
              nextTools = nextTools.map((t) =>
                t.id === toolCallId ? { ...t, result: data.partialResult } : t,
              );
            } else if (phase === "result") {
              nextTools = nextTools.map((t) =>
                t.id === toolCallId
                  ? { ...t, result: data.result, isError: data.isError, isStreaming: false }
                  : t,
              );
            }

            return [...prev.slice(0, -1), { ...last, tools: nextTools }];
          });
        }
      }
    };

    void refreshSessionInfo();
  }, [gateway, sessionKey, refreshSessionInfo]);

  const addMessage = useCallback((msg: Message) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const history = (await gateway.loadHistory({ sessionKey, limit: 100 })) as any;
      if (Array.isArray(history?.messages)) {
        const msgs = history.messages.map((m: any) => ({
          id: m.id || Math.random().toString(),
          role: m.role,
          content: extractContentFromMessage(m) || "",
          thinking: extractThinkingFromMessage(m) || "",
          isFinal: true,
        }));
        setMessages(msgs);
      }
    } catch (err) {
      console.error("Failed to load history", err);
    }
  }, [gateway, sessionKey]);

  const sendMessage = useCallback(
    async (text: string) => {
      addMessage({ id: Math.random().toString(), role: "user", content: text });
      setStatus("running");
      const { runId } = await gateway.sendChat({ sessionKey, message: text });
      setActiveRunId(runId);
    },
    [gateway, sessionKey, addMessage],
  );

  return {
    messages,
    status,
    sendMessage,
    addMessage,
    sessionInfo,
    sessionKey,
    setSessionKey,
    refreshSessionInfo,
    loadHistory,
    activeRunId,
  };
};
