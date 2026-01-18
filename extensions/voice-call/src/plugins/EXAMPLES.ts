/**
 * Plugin System Examples
 *
 * This file demonstrates common usage patterns for the plugin system.
 * Not meant to be executed - use for reference and documentation.
 */

// ============================================================================
// Example 1: Initialize Built-in Plugins
// ============================================================================

async function example_initializePlugins() {
  import { initializeBuiltInPlugins } from "./index.js";

  const result = await initializeBuiltInPlugins();
  if (!result.success) {
    console.error("Failed to initialize plugins:", result.message);
    return;
  }

  console.log("Plugins initialized successfully");
}

// ============================================================================
// Example 2: Use STT Provider
// ============================================================================

async function example_useSTT() {
  import { getPluginRegistry } from "./registry.js";

  const registry = getPluginRegistry();
  const provider = registry.getSTT("openai-realtime");

  // Create a session
  const session = provider.createSession({ instanceId: "example-session" });

  try {
    // Connect
    await session.connect();
    console.log("Connected to STT service");

    // Set up callbacks
    let fullTranscript = "";
    session.onPartial((partial) => {
      console.log("[Partial]", partial);
    });

    session.onTranscript((transcript) => {
      console.log("[Final]", transcript);
      fullTranscript = transcript;
    });

    session.onError((error) => {
      console.error("[Error]", error.message);
    });

    // Simulate sending audio chunks
    const audioChunk = Buffer.from([/* mu-law audio */]);
    session.sendAudio(audioChunk);

    // Wait for result
    const text = await session.waitForTranscript(30000);
    console.log("Transcription complete:", text);
  } finally {
    session.close();
  }
}

// ============================================================================
// Example 3: Use TTS Provider
// ============================================================================

async function example_useTTS() {
  import { getPluginRegistry } from "./registry.js";

  const registry = getPluginRegistry();
  const provider = registry.getTTS("openai-tts");

  // Generate basic speech
  const pcm = await provider.synthesize("Hello, world!");
  console.log("Generated audio:", pcm.length, "bytes");

  // Generate Twilio-compatible audio
  const mulaw = await provider.synthesizeForTwilio("Welcome to the voice service");
  console.log("Generated mu-law audio:", mulaw.length, "bytes");

  // Generate with custom voice
  const customVoice = await provider.synthesize("Premium message", {
    voice: "cedar",
  });
  console.log("Generated with cedar voice:", customVoice.length, "bytes");

  // Generate with instructions (gpt-4o-mini-tts only)
  const cheerful = await provider.synthesize("Good morning!", {
    instructions: "Speak in a cheerful and upbeat tone",
  });
  console.log("Generated cheerful audio:", cheerful.length, "bytes");
}

// ============================================================================
// Example 4: Register Custom Provider
// ============================================================================

async function example_registerCustomProvider() {
  import type {
    STTProvider,
    STTSession,
    PluginMetadata,
    PluginConfig,
  } from "./interfaces.js";
  import { getPluginRegistry } from "./registry.js";

  // Define custom provider
  class MockSTTProvider implements STTProvider {
    readonly metadata: PluginMetadata = {
      name: "mock-stt",
      version: "1.0.0",
      type: "stt",
      description: "Mock STT for testing",
      capabilities: ["mock"],
    };

    createSession(config?: PluginConfig): STTSession {
      // Return session instance
      return null as any; // Simplified for example
    }

    validateConfig(): void {
      // Validate configuration
    }
  }

  // Register it
  const registry = getPluginRegistry();
  const provider = new MockSTTProvider();
  const result = registry.registerSTT("mock", provider);

  if (result.success) {
    console.log("Custom provider registered:", result.message);
  } else {
    console.error("Registration failed:", result.error?.message);
  }
}

// ============================================================================
// Example 5: Discover Plugins
// ============================================================================

async function example_discoverPlugins() {
  import { getPluginRegistry } from "./registry.js";

  const registry = getPluginRegistry();

  // List all plugins
  console.log("=== All Plugins ===");
  for (const plugin of registry.getAll()) {
    console.log(`- ${plugin.name} (${plugin.type})`);
  }

  // List STT plugins
  console.log("\n=== STT Plugins ===");
  for (const plugin of registry.getAllSTT()) {
    console.log(
      `- ${plugin.name} (v${plugin.instance.metadata.version})`,
    );
  }

  // List TTS plugins
  console.log("\n=== TTS Plugins ===");
  for (const plugin of registry.getAllTTS()) {
    console.log(
      `- ${plugin.name} (v${plugin.instance.metadata.version})`,
    );
  }

  // Discover with filter
  const sttPlugins = registry.discover({ type: "stt" });
  console.log(`\nFound ${sttPlugins.length} STT plugins`);
}

// ============================================================================
// Example 6: Plugin Metadata
// ============================================================================

async function example_pluginMetadata() {
  import { getPluginRegistry } from "./registry.js";

  const registry = getPluginRegistry();

  // Get plugin info
  const registration = registry.get("openai-tts");
  if (!registration) {
    console.log("Plugin not found");
    return;
  }

  const metadata = registration.instance.metadata;
  console.log("Plugin Metadata:");
  console.log(`  Name: ${metadata.name}`);
  console.log(`  Version: ${metadata.version}`);
  console.log(`  Type: ${metadata.type}`);
  console.log(`  Description: ${metadata.description}`);
  console.log(`  Capabilities: ${metadata.capabilities.join(", ")}`);
  console.log(`  Authors: ${metadata.authors?.join(", ") || "N/A"}`);
  console.log(`  License: ${metadata.license || "N/A"}`);
  console.log(`  Registered: ${registration.registeredAt.toISOString()}`);
}

// ============================================================================
// Example 7: Audio Chunking for Streaming
// ============================================================================

async function example_audioChunking() {
  import { chunkAudio, getPluginRegistry } from "./index.js";

  const registry = getPluginRegistry();
  const provider = registry.getTTS("openai-tts");

  // Generate audio
  const mulaw = await provider.synthesizeForTwilio("Streaming audio demo");

  // Chunk into 20ms frames (160 bytes at 8kHz)
  console.log("Streaming audio chunks:");
  let chunkCount = 0;
  for (const chunk of chunkAudio(mulaw, 160)) {
    chunkCount++;
    console.log(`  Chunk ${chunkCount}: ${chunk.length} bytes`);
    // Send chunk to media stream
  }
}

// ============================================================================
// Example 8: Error Handling
// ============================================================================

async function example_errorHandling() {
  import { PluginRegistryError, getPluginRegistry } from "./index.js";

  const registry = getPluginRegistry();

  try {
    // Try to get non-existent plugin
    const provider = registry.getSTT("does-not-exist");
  } catch (error) {
    if (error instanceof PluginRegistryError) {
      console.error(`Plugin Error (${error.code}): ${error.message}`);
    } else {
      console.error("Unexpected error:", error);
    }
  }

  // Handle session errors
  try {
    const sttProvider = registry.getSTT("openai-realtime");
    const session = sttProvider.createSession();

    session.onError((error) => {
      console.error("Session error occurred:", error.message);
      // Handle error gracefully
      session.close();
    });

    await session.connect();
  } catch (error) {
    console.error("Failed to create session:", error);
  }
}

// ============================================================================
// Example 9: Voice Selection (TTS)
// ============================================================================

async function example_voiceSelection() {
  import { OPENAI_TTS_VOICES, getPluginRegistry } from "./index.js";

  const registry = getPluginRegistry();
  const provider = registry.getTTS("openai-tts");

  console.log("Available voices:", OPENAI_TTS_VOICES);

  // Generate with different voices
  const voices = ["alloy", "cedar", "marin"] as const;
  for (const voice of voices) {
    const audio = await provider.synthesize("Hello", { voice });
    console.log(`Generated audio with ${voice} voice: ${audio.length} bytes`);
  }
}

// ============================================================================
// Example 10: Full Conversation Flow (STT + TTS)
// ============================================================================

async function example_conversationFlow() {
  import { getPluginRegistry } from "./registry.js";

  const registry = getPluginRegistry();
  const sttProvider = registry.getSTT("openai-realtime");
  const ttsProvider = registry.getTTS("openai-tts");

  // 1. Listen for user input
  console.log("Listening for user...");
  const sttSession = sttProvider.createSession();
  await sttSession.connect();

  // Simulate audio input
  const audioInput = Buffer.from([/* mu-law audio */]);
  sttSession.sendAudio(audioInput);

  // Wait for transcription
  const userText = await sttSession.waitForTranscript(30000);
  console.log("User said:", userText);
  sttSession.close();

  // 2. Generate response (simulated)
  const responseText = `You said: "${userText}". This is the bot response.`;

  // 3. Convert response to speech
  console.log("Generating response audio...");
  const responseAudio = await ttsProvider.synthesizeForTwilio(responseText);
  console.log("Response audio generated:", responseAudio.length, "bytes");

  // 4. Play response (simulated)
  console.log("Playing response to user...");
}

// Export examples (for documentation purposes)
export const EXAMPLES = {
  initializePlugins: example_initializePlugins,
  useSTT: example_useSTT,
  useTTS: example_useTTS,
  registerCustomProvider: example_registerCustomProvider,
  discoverPlugins: example_discoverPlugins,
  pluginMetadata: example_pluginMetadata,
  audioChunking: example_audioChunking,
  errorHandling: example_errorHandling,
  voiceSelection: example_voiceSelection,
  conversationFlow: example_conversationFlow,
};
