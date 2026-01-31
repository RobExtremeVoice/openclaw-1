import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";

import { universalImPlugin } from "./src/channel.js";
import { setUniversalImRuntime } from "./src/runtime.js";

// Register built-in providers
import { customProvider } from "./src/providers/index.js";
import { registerProvider } from "./src/registry/index.js";

// Register built-in transports
import { webhookTransport, websocketTransport, pollingTransport } from "./src/transports/index.js";
import { registerTransport } from "./src/registry/index.js";

// Initialize built-in providers and transports
function initializeBuiltins() {
  // Register custom provider (default)
  try {
    registerProvider(customProvider);
  } catch {
    // Already registered
  }

  // Register transports
  try {
    registerTransport(webhookTransport);
  } catch {
    // Already registered
  }
  try {
    registerTransport(websocketTransport);
  } catch {
    // Already registered
  }
  try {
    registerTransport(pollingTransport);
  } catch {
    // Already registered
  }
}

const plugin = {
  id: "universal-im",
  name: "Universal IM",
  description: "Universal IM channel plugin - unified messaging integration",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    initializeBuiltins();
    setUniversalImRuntime(api.runtime);
    api.registerChannel({ plugin: universalImPlugin });
  },
};

export default plugin;

// Re-export types and registry functions for external plugins
export type {
  UniversalInboundMessage,
  UniversalOutboundPayload,
  UniversalProvider,
  UniversalTransport,
  UniversalTransportType,
  InboundHook,
  OutboundHook,
  ProviderParseContext,
  ProviderOutboundContext,
  TransportStartContext,
  InboundHookContext,
  OutboundHookContext,
  UniversalImAccountConfig,
  UniversalImConfig,
} from "./src/types.js";

export {
  registerProvider,
  getProvider,
  listProviders,
  registerTransport,
  getTransport,
  listTransports,
  registerInboundHook,
  registerOutboundHook,
} from "./src/registry/index.js";
