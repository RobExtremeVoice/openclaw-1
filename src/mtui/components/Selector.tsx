import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";

type Item = {
  label: string;
  value: string;
};

type SelectorProps = {
  title: string;
  items: Item[];
  onSelect: (item: Item) => void;
  onCancel: () => void;
};

export const Selector: React.FC<SelectorProps> = ({ title, items, onSelect, onCancel }) => {
  const [query, setQuery] = useState("");

  const filteredItems = items.filter(
    (item) =>
      item.label.toLowerCase().includes(query.toLowerCase()) ||
      item.value.toLowerCase().includes(query.toLowerCase()),
  );

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
    }
    if (!key.ctrl && !key.meta && input.length === 1 && !key.return) {
      setQuery((q) => q + input);
    }
    if (key.backspace || key.delete) {
      setQuery((q) => q.slice(0, -1));
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="blue" paddingX={1}>
      <Text bold>{title}</Text>
      <Box marginY={1}>
        <Text>Search: {query}</Text>
      </Box>
      <SelectInput items={filteredItems} onSelect={onSelect} />
      <Box marginTop={1}>
        <Text dimColor>Esc to cancel</Text>
      </Box>
    </Box>
  );
};
