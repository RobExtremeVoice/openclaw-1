import React, { createContext, useContext, useState } from "react";

type Settings = {
  showThinking: boolean;
  setShowThinking: (show: boolean) => void;
  toolsExpanded: boolean;
  setToolsExpanded: (expanded: boolean) => void;
};

const SettingsContext = createContext<Settings | null>(null);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [showThinking, setShowThinking] = useState(false);
  const [toolsExpanded, setToolsExpanded] = useState(false);

  return (
    <SettingsContext.Provider
      value={{ showThinking, setShowThinking, toolsExpanded, setToolsExpanded }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
};
