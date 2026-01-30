import React, { useState, useEffect } from "react";
import { Box, Text, useInput, useApp } from "ink";
import Spinner from "ink-spinner";
import { GatewayProvider, useGateway } from "./context/GatewayContext.js";
import { SettingsProvider, useSettings } from "./context/SettingsContext.js";
import { useChat } from "./hooks/useChat.js";
import { useCommands } from "./hooks/useCommands.js";
import { MessageView } from "./components/MessageView.js";
import { InputBar } from "./components/InputBar.js";
import { Selector } from "./components/Selector.js";
import type { TuiOptions } from "../tui/tui-types.js";
import { formatContextUsageLine } from "../tui/tui-formatters.js";

type AppProps = {
  options: TuiOptions;
};

const ChatApp: React.FC<{ options: TuiOptions }> = ({ options }) => {
  const { exit } = useApp();
  const gateway = useGateway();
  const { showThinking, setShowThinking } = useSettings();
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("connecting");
  const [error, setError] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<{ type: "model" | "agent"; items: any[] } | null>(null);

  const {
    messages,
    status,
    sendMessage,
    addMessage,
    sessionInfo,
    sessionKey,
    refreshSessionInfo,
    loadHistory,
  } = useChat(options.session || "main");

  const { handleLocalShell, handleSlashCommand } = useCommands(
    sessionKey,
    addMessage,
    refreshSessionInfo,
  );

  useEffect(() => {
    gateway.onConnected = () => {
      setConnectionStatus("connected");
      setError(null);
      void loadHistory();
    };

    gateway.onDisconnected = (reason) => {
      setConnectionStatus("disconnected");
      setError(reason || "Connection closed");
    };

    gateway.start();

    return () => {
      gateway.stop();
    };
  }, [gateway, loadHistory]);

  const handleSubmit = async (value: string) => {
    if (value.startsWith("!")) {
      await handleLocalShell(value);
    } else if (value.startsWith("/")) {
      if (value === "/model") {
        const models = await gateway.listModels();
        setOverlay({
          type: "model",
          items: models.map((m) => ({
            label: `${m.provider}/${m.id}`,
            value: `${m.provider}/${m.id}`,
          })),
        });
      } else {
        await handleSlashCommand(value);
      }
    } else {
      await sendMessage(value);
    }
  };

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit();
    }
    if (key.escape && overlay) {
      setOverlay(null);
    }
    if (key.ctrl && input === "t") {
      setShowThinking(!showThinking);
    }
  });

  const usageLine = formatContextUsageLine({
    total: sessionInfo.totalTokens,
    context: sessionInfo.contextTokens,
    remaining: (sessionInfo.contextTokens ?? 0) - (sessionInfo.totalTokens ?? 0),
    percent:
      sessionInfo.totalTokens && sessionInfo.contextTokens
        ? (sessionInfo.totalTokens / sessionInfo.contextTokens) * 100
        : null,
  });

  return (
    <Box flexDirection="column" padding={1} minHeight={20}>
      <Box borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Text bold color="white">
          Moltbot MTUI
        </Text>
        <Box flexGrow={1} />
        <Box paddingX={2}>
          <Text dimColor>{sessionInfo.model || "no model"}</Text>
        </Box>
        <Text
          color={
            connectionStatus === "connected"
              ? "green"
              : connectionStatus === "connecting"
                ? "yellow"
                : "red"
          }
        >
          {connectionStatus === "connecting" && <Spinner type="dots" />} {connectionStatus}
        </Text>
      </Box>

      {overlay ? (
        <Box flexGrow={1} justifyContent="center" alignItems="center">
          <Selector
            title={`Select ${overlay.type}`}
            items={overlay.items}
            onSelect={async (item) => {
              if (overlay.type === "model") {
                await gateway.patchSession({ key: sessionKey, model: item.value });
                addMessage({
                  id: Math.random().toString(),
                  role: "system",
                  content: `Model set to ${item.value}`,
                });
                await refreshSessionInfo();
              }
              setOverlay(null);
            }}
            onCancel={() => setOverlay(null)}
          />
        </Box>
      ) : (
        <Box flexGrow={1} flexDirection="column">
          <Box flexDirection="column">
            {messages.slice(-10).map((msg, i) => (
              <MessageView key={i} message={msg} />
            ))}
          </Box>
        </Box>
      )}

      {status === "running" && !overlay && (
        <Box paddingX={1} marginBottom={1}>
          <Text color="yellow">
            <Spinner type="dots" /> Assistant is thinking...
          </Text>
        </Box>
      )}

      {error && !overlay && (
        <Box paddingX={1} marginBottom={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {!overlay && (
        <>
          <Box paddingX={1} marginBottom={1}>
            <Text dimColor>{usageLine}</Text>
          </Box>

          <InputBar onSubmit={handleSubmit} status={status} />

          <Box paddingX={1} marginTop={1}>
            <Text dimColor>Ctrl+C exit | Ctrl+T think | /model | /reset | !ls</Text>
          </Box>
        </>
      )}
    </Box>
  );
};

export const App: React.FC<AppProps> = ({ options }) => {
  return (
    <SettingsProvider>
      <GatewayProvider options={options}>
        <ChatApp options={options} />
      </GatewayProvider>
    </SettingsProvider>
  );
};
