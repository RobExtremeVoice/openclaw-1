/**
 * Discord Direct Call Integration Example
 *
 * Demonstrates how to integrate direct call support into your Discord bot.
 * Shows both incoming and outgoing call handling with full voice streaming.
 *
 * NOTE: This is a reference/example file and demonstrates the integration pattern.
 * For actual use, copy patterns into your Discord bot initialization.
 *
 * Usage:
 * ```typescript
 * import { setupDirectCallHandlers } from './direct-call-integration.example.js';
 *
 * // In your Discord bot initialization:
 * await setupDirectCallHandlers(config);
 * ```
 */

import type { VoiceBasedChannel } from 'discord.js';
import { DiscordCallManager, type CallManagerConfig } from './call-manager.js';
import { createCallResponder, type CallResponseConfig } from './call-responder.js';
import type { VoiceProvidersConfig } from '../../config/zod-schema.voice-providers.js';
import { getChildLogger } from '../../logging.js';

const logger = getChildLogger({ module: 'discord-direct-call-integration' });

/**
 * Configuration for direct call integration
 */
export interface DirectCallIntegrationConfig {
  /** Voice provider configuration */
  voiceProviders?: VoiceProvidersConfig;

  /** Call manager configuration */
  callManager?: CallManagerConfig;

  /** Call response configuration */
  callResponse?: CallResponseConfig;

  /** Function to generate agent responses */
  generateAgentResponse?: (userId: string, input: string) => Promise<string>;

  /** Enable auto-accept for incoming calls (default: false) */
  autoAcceptCalls?: boolean;

  /** List of user IDs allowed to call (empty = allow all) */
  allowedCallers?: string[];

  /** Maximum concurrent calls (default: 5) */
  maxConcurrentCalls?: number;

  /** Deepgram API key for STT */
  deepgramApiKey?: string;
}

/**
 * INTEGRATION PATTERN:
 *
 * In your Discord bot initialization, use this pattern to set up direct calls:
 *
 * ```typescript
 * import { VoiceProviderRegistry } from '@media/voice-providers/registry';
 * import { DiscordCallManager } from './call-manager';
 *
 * // Initialize STT provider
 * const registry = new VoiceProviderRegistry(config.voiceProviders);
 * const deepgram = (await registry.getTranscriber()) as DeepgramExecutor;
 *
 * // Create call manager
 * const callManager = new DiscordCallManager({
 *   autoAcceptCalls: false,
 *   maxConcurrentCalls: 5,
 * }, deepgram);
 *
 * // Register voice state handler
 * client.on('voiceStateUpdate', async (oldState, newState) => {
 *   // Handle incoming calls, detect user voice state changes
 * });
 * ```
 */
export async function setupDirectCallHandlers(
  config: DirectCallIntegrationConfig,
): Promise<void> {
  logger.info('Direct call setup pattern registered');
  logger.info('See integration pattern in function documentation');

  // This is a documentation/example file showing the pattern
  // Actual implementation belongs in your Discord bot client initialization
}

/**
 * Handle voice state updates to detect incoming calls
 */
export async function handleVoiceStateUpdate(
  oldState: any,
  newState: any,
  callManager: DiscordCallManager,
  config: DirectCallIntegrationConfig,
): Promise<void> {
  // User joined a voice channel
  if (!oldState.channel && newState.channel) {
    logger.info(
      { userId: newState.member?.id, channelId: newState.channel.id },
      'User joined voice channel',
    );

    // Check if incoming call should be accepted
    if (config.allowedCallers && !config.allowedCallers.includes(newState.member?.id)) {
      logger.info({ userId: newState.member?.id }, 'User not in allowed callers list');
      return;
    }

    // Auto-accept if configured
    if (config.autoAcceptCalls) {
      try {
        logger.info({ userId: newState.member?.id }, 'Auto-accepting incoming call');
        // Accept call logic here
      } catch (error) {
        logger.error(
          { error: error instanceof Error ? error.message : String(error) },
          'Failed to auto-accept call',
        );
      }
    }
  }

  // User left voice channel
  if (oldState.channel && !newState.channel) {
    logger.info(
      { userId: oldState.member?.id, channelId: oldState.channel.id },
      'User left voice channel',
    );
    // End call logic here
  }
}

/**
 * Example: Initiate outgoing call to a user
 *
 * PATTERN for outgoing calls:
 *
 * ```typescript
 * // 1. Get Discord resources
 * const guild = await client.guilds.fetch(guildId);
 * const channel = await guild.channels.fetch(channelId) as VoiceBasedChannel;
 * const member = await guild.members.fetch(userId);
 * const dmChannel = await member.createDM();
 *
 * // 2. Initiate call via manager
 * const connector = await callManager.initiateCall({
 *   userId,
 *   channelId: dmChannel.id,
 *   adapterCreator: channel.guild?.voiceAdapterCreator,
 * });
 *
 * // 3. Setup transcription handler
 * connector.onTranscription(async (transcription) => {
 *   if (transcription.partial) return;
 *   // Generate and play response (same as incoming calls)
 * });
 * ```
 *
 * For complete implementation, see the CallConnector and CallResponder classes.
 */
export async function initiateOutgoingCall(
  userId: string,
  channelId: string,
  callManager: DiscordCallManager,
  config: DirectCallIntegrationConfig,
): Promise<void> {
  logger.info({ userId, channelId }, 'Outgoing call pattern documented');
  // See documentation above for implementation pattern
}

/**
 * Example: Custom agent integration pattern
 *
 * Shows how to integrate custom response generation with direct calls.
 *
 * PATTERN:
 * ```typescript
 * // Define your agent response function
 * const generateAgentResponse = async (userId: string, input: string): Promise<string> => {
 *   // Call your AI agent/LLM to generate response
 *   // Return the response text
 * };
 *
 * // Pass to CallResponder when creating responses
 * const responder = createCallResponder(config, generateAgentResponse);
 * ```
 */
export async function setupDirectCallsWithCustomAgent(): Promise<void> {
  logger.info('Custom agent pattern registered');
  logger.info('See pattern documentation in function');

  // Custom agent response function example
  const generateAgentResponse = async (
    userId: string,
    input: string,
  ): Promise<string> => {
    // In a real implementation, this would call your AI agent/LLM
    // For example: Claude API, OpenAI, or your custom agent

    // Example: Simple conversational response
    const responses = [
      'I understand. Let me help you with that.',
      'That\'s an interesting question. Here\'s what I think...',
      'I see what you mean. Could you tell me more?',
      'Great! Let me process that for you.',
    ];

    const randomResponse =
      responses[Math.floor(Math.random() * responses.length)];
    return `${randomResponse} You said: "${input}"`;
  };

  // In actual implementation, you would:
  // 1. Create call manager with STT provider
  // 2. Create call responder with your agent function
  // 3. Wire them together in your Discord bot client event handlers

  logger.info('Direct calls with custom agent pattern ready');
}

/**
 * Example: End a call programmatically
 *
 * PATTERN for ending calls:
 *
 * ```typescript
 * const success = await callManager.endCall(userId);
 * if (success) {
 *   logger.info({ userId }, 'Call ended');
 * }
 * ```
 */
export async function endCall(userId: string, callManager: DiscordCallManager): Promise<void> {
  logger.info({ userId }, 'Call end pattern documented');
}

/**
 * Example: Get call statistics
 *
 * PATTERN for retrieving call data:
 *
 * ```typescript
 * const stats = await callManager.getCallStats(userId);
 * if (stats) {
 *   logger.info(
 *     {
 *       duration: stats.duration,
 *       startedAt: stats.startedAt,
 *     },
 *     'Call statistics',
 *   );
 * }
 * ```
 */
export async function getCallStats(userId: string, callManager: DiscordCallManager): Promise<void> {
  logger.info({ userId }, 'Call stats pattern documented');
}

export default setupDirectCallHandlers;
