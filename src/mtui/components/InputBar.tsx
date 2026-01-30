import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

type InputBarProps = {
  onSubmit: (value: string) => void;
  status: string;
};

export const InputBar: React.FC<InputBarProps> = ({ onSubmit, status }) => {
  const [value, setValue] = useState("");

  const handleSubmit = (val: string) => {
    if (!val.trim()) return;
    onSubmit(val);
    setValue("");
  };

  return (
    <Box flexDirection="column">
      <Box paddingX={1} borderStyle="single" borderColor={status === "idle" ? "cyan" : "yellow"}>
        <Text bold color="cyan">
          moltbot {">"}{" "}
        </Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          placeholder="Type a message or / for commands..."
        />
      </Box>
    </Box>
  );
};
