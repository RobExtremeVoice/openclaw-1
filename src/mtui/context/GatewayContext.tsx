import React, { createContext, useContext, useMemo } from "react";
import { GatewayChatClient } from "../../tui/gateway-chat.js";
import type { TuiOptions } from "../../tui/tui-types.js";

const GatewayContext = createContext<GatewayChatClient | null>(null);

export const GatewayProvider: React.FC<{ options: TuiOptions; children: React.ReactNode }> = ({
  options,
  children,
}) => {
  const client = useMemo(() => new GatewayChatClient(options), [options]);

  return <GatewayContext.Provider value={client}>{children}</GatewayContext.Provider>;
};

export const useGateway = () => {
  const context = useContext(GatewayContext);
  if (!context) {
    throw new Error("useGateway must be used within a GatewayProvider");
  }
  return context;
};
