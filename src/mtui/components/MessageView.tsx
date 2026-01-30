import React from "react";
import { Box, Text } from "ink";
import { highlight } from "cli-highlight";
import type { Message } from "../hooks/useChat.js";
import { useSettings } from "../context/SettingsContext.js";

type MessageViewProps = {
  message: Message;
};

export const MessageView: React.FC<MessageViewProps> = ({ message }) => {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const { showThinking } = useSettings();

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box marginBottom={0}>
        <Text bold color={isUser ? "blue" : isSystem ? "yellow" : "green"}>
          {isUser ? "You" : isSystem ? "System" : "Assistant"}
        </Text>
      </Box>
      <Box paddingLeft={2} flexDirection="column">
        {message.thinking && (
          <Box flexDirection="column" marginY={1}>
            <Box>
              <Text dimColor italic>
                {showThinking ? "▼ Thinking" : "▶ Thinking (hidden)"}
              </Text>
            </Box>
            {showThinking && (
              <Box paddingLeft={2} borderStyle="single" borderColor="gray">
                <Text italic dimColor>
                  {message.thinking}
                </Text>
              </Box>
            )}
          </Box>
        )}

        {renderContent(message.content)}

        {message.tools && message.tools.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            {message.tools.map((tool) => (
              <Box
                key={tool.id}
                flexDirection="column"
                borderStyle="round"
                borderColor="gray"
                paddingX={1}
                marginBottom={1}
              >
                <Text bold color="cyan">
                  Tool: {tool.name}
                </Text>
                <Text dimColor>Args: {JSON.stringify(tool.args)}</Text>
                {tool.isStreaming && <Text color="yellow">Running...</Text>}
                {tool.result && (
                  <Box marginTop={1}>
                    <Text color={tool.isError ? "red" : "gray"}>
                      Result:{" "}
                      {typeof tool.result === "string" ? tool.result : JSON.stringify(tool.result)}
                    </Text>
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
};

function renderContent(content: string) {
  const parts = content.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith("```")) {
      const match = part.match(/```(\w*)\n([\s\S]*?)```/);
      if (match) {
        const lang = match[1] || "text";
        const code = match[2];
        try {
          return (
            <Box key={i} marginY={1} paddingX={1} borderStyle="single" borderColor="gray">
              <Text>{highlight(code, { language: lang })}</Text>
            </Box>
          );
        } catch {
          return (
            <Box key={i} marginY={1} paddingX={1} borderStyle="single" borderColor="gray">
              <Text>{code}</Text>
            </Box>
          );
        }
      }
    }
    return <Text key={i}>{part}</Text>;
  });
}
