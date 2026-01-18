/**
 * Deepgram Docker Integration Example
 *
 * Demonstrates how to use the DeepgramDockerHandler for:
 * - Starting a Deepgram container with automatic port assignment
 * - Setting up WebSocket connections
 * - Streaming audio transcription
 * - Connection pooling
 * - Proper cleanup
 */

import DeepgramDockerHandler, { type DeepgramDockerConfig } from './deployments/deepgram-docker.js';
import { AudioFormat } from './executor.js';

/**
 * Example 1: Basic container setup and transcription
 */
export async function exampleBasicTranscription(): Promise<void> {
  console.log('=== Example 1: Basic Transcription ===\n');

  const handler = new DeepgramDockerHandler('deepgram:latest', 8888, 8889);

  try {
    // Configure Docker deployment
    const config: DeepgramDockerConfig = {
      image: 'deepgram:latest',
      port: 8888,
      env: {
        DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY || 'your-api-key',
      },
      volumes: {
        '/tmp/deepgram-cache': '/root/.cache/deepgram',
      },
    };

    // Start container
    console.log('Starting Deepgram Docker container...');
    const containerId = await handler.startContainer(config);
    console.log(`Container started: ${containerId}`);
    console.log(`WebSocket port: ${handler.getWebSocketPort()}`);
    console.log(`Health check port: ${handler.getHealthCheckPort()}\n`);

    // Create a WebSocket connection
    console.log('Creating WebSocket connection...');
    const ws = await handler.createWebSocketConnection('nova-v3', 'en-US');
    console.log('WebSocket connection established\n');

    // Simulate sending audio (in real scenario, this would be actual audio data)
    console.log('Sending audio data...');
    const audioChunk = new Uint8Array(1024);
    audioChunk.fill(0x00); // Silence
    ws.send(audioChunk);

    // Send stream termination
    ws.send(JSON.stringify({ type: 'FinishStream' }));

    // Close connection
    ws.close();
    console.log('Connection closed\n');

    // Return connection to pool for reuse
    handler.returnPooledConnection(ws, 'nova-v3', 'en-US');
    console.log('Connection returned to pool for reuse\n');

    // Cleanup
    console.log('Cleaning up...');
    await handler.cleanup();
    console.log('Cleanup complete\n');
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * Example 2: Connection pooling with multiple concurrent streams
 */
export async function exampleConnectionPooling(): Promise<void> {
  console.log('=== Example 2: Connection Pooling ===\n');

  const handler = new DeepgramDockerHandler('deepgram:latest', 8888, 8889);

  try {
    // Start container
    const config: DeepgramDockerConfig = {
      image: 'deepgram:latest',
      port: 8888,
    };

    console.log('Starting container with pooling...');
    await handler.startContainer(config);

    // Create multiple connections and pool them
    console.log('Creating and pooling connections...');
    const connections = [];

    for (let i = 0; i < 5; i++) {
      const ws = await handler.createWebSocketConnection('nova-v3', 'en-US');
      connections.push(ws);
      handler.returnPooledConnection(ws, 'nova-v3', 'en-US');
    }

    // Check pool statistics
    const stats = handler.getPoolStats();
    console.log('Pool statistics:', stats);
    console.log(`Connections available: ${stats['nova-v3:en-US']} (max: 10)\n`);

    // Simulate reusing a pooled connection
    console.log('Reusing pooled connection...');
    const reusedWs = await handler.getPooledConnection('nova-v3', 'en-US');
    console.log('Pooled connection reused successfully');

    // Send audio through pooled connection
    const audioChunk = new Uint8Array(2048);
    audioChunk.fill(0x7f);
    reusedWs.send(audioChunk);

    reusedWs.close();
    console.log('Connection used and closed\n');

    // Cleanup
    await handler.cleanup();
    console.log('Pooling example complete\n');
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * Example 3: Multi-language support
 */
export async function exampleMultiLanguage(): Promise<void> {
  console.log('=== Example 3: Multi-Language Support ===\n');

  const handler = new DeepgramDockerHandler('deepgram:latest', 8888, 8889);

  try {
    // Start container
    const config: DeepgramDockerConfig = {
      image: 'deepgram:latest',
      port: 8888,
    };

    await handler.startContainer(config);

    // Supported languages
    const languages = [
      { code: 'en-US', name: 'English (US)' },
      { code: 'en-GB', name: 'English (GB)' },
      { code: 'es-ES', name: 'Spanish' },
      { code: 'fr-FR', name: 'French' },
      { code: 'de-DE', name: 'German' },
      { code: 'ja-JP', name: 'Japanese' },
    ];

    console.log('Creating connections for different languages:\n');

    for (const { code, name } of languages) {
      const ws = await handler.createWebSocketConnection('nova-v3', code);
      console.log(`✓ ${name} (${code}): WebSocket ready`);
      handler.returnPooledConnection(ws, 'nova-v3', code);
    }

    // Show pool statistics
    const stats = handler.getPoolStats();
    console.log('\nPool statistics after multi-language setup:');
    for (const [key, count] of Object.entries(stats)) {
      console.log(`  ${key}: ${count} connections`);
    }

    console.log('\n');
    await handler.cleanup();
    console.log('Multi-language example complete\n');
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * Example 4: WebSocket URL construction
 */
export async function exampleWebSocketURL(): Promise<void> {
  console.log('=== Example 4: WebSocket URL Construction ===\n');

  const handler = new DeepgramDockerHandler('deepgram:latest', 8888, 8889);

  // Simulate port assignment
  (handler as any).assignedWsPort = 9000;

  // Build URLs for different models and languages
  const configs = [
    { model: 'nova-v3', language: 'en-US', desc: 'Nova v3 English (US)' },
    { model: 'flux', language: 'en-US', desc: 'Flux English (US)' },
    { model: 'nova-v3', language: 'es-ES', desc: 'Nova v3 Spanish' },
    { model: 'flux', language: 'fr-FR', desc: 'Flux French' },
  ];

  console.log('WebSocket URLs with parameters:\n');

  for (const { model, language, desc } of configs) {
    const url = (handler as any).buildWebSocketUrl(model, language);
    const parsedUrl = new URL(url);

    console.log(`${desc}:`);
    console.log(`  Base: ${parsedUrl.origin}${parsedUrl.pathname}`);
    console.log(`  Model: ${parsedUrl.searchParams.get('model')}`);
    console.log(`  Language: ${parsedUrl.searchParams.get('language')}`);
    console.log(`  Encoding: ${parsedUrl.searchParams.get('encoding')}`);
    console.log(`  Sample Rate: ${parsedUrl.searchParams.get('sample_rate')}`);
    console.log(`  VAD Events: ${parsedUrl.searchParams.get('vad_events')}`);
    console.log(`  Interim Results: ${parsedUrl.searchParams.get('interim_results')}`);
    console.log();
  }
}

/**
 * Example 5: Error handling and recovery
 */
export async function exampleErrorHandling(): Promise<void> {
  console.log('=== Example 5: Error Handling ===\n');

  const handler = new DeepgramDockerHandler('deepgram:latest', 8888, 8889);

  try {
    // Try to get WebSocket port without starting container
    console.log('Test 1: WebSocket port before container start');
    const portBefore = handler.getWebSocketPort();
    console.log(`Port: ${portBefore} (expected: null)\n`);

    // Test invalid configuration
    console.log('Test 2: Invalid configuration handling');
    try {
      await handler.startContainer(undefined as any);
    } catch (error) {
      console.log(`✓ Caught expected error: ${error instanceof Error ? error.message : String(error)}\n`);
    }

    // Test creating WebSocket without port assignment
    console.log('Test 3: WebSocket connection without port assignment');
    try {
      await handler.createWebSocketConnection();
    } catch (error) {
      console.log(`✓ Caught expected error: ${error instanceof Error ? error.message : String(error)}\n`);
    }

    // Cleanup
    await handler.cleanup();
    console.log('Error handling example complete\n');
  } catch (error) {
    console.error('Unexpected error:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * Example 6: Docker operations
 */
export async function exampleDockerOperations(): Promise<void> {
  console.log('=== Example 6: Docker Operations ===\n');

  const handler = new DeepgramDockerHandler('deepgram:latest', 8888, 8889);

  try {
    // Check Docker availability
    console.log('Checking Docker availability...');
    const isDockerAvailable = await handler.checkDockerAvailable();
    console.log(`Docker available: ${isDockerAvailable}\n`);

    if (isDockerAvailable) {
      console.log('Docker is available. Container operations can be performed.');
    } else {
      console.log('Docker is not available. Running in simulation mode.');
    }

    console.log('\nNote: In production, ensure:');
    console.log('  1. Docker daemon is running');
    console.log('  2. Deepgram image is available or can be pulled');
    console.log('  3. Sufficient system resources (CPU, memory, ports)');
    console.log('  4. Network connectivity for health checks');
    console.log();
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * Run all examples
 */
export async function runAllExamples(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('DEEPGRAM DOCKER HANDLER EXAMPLES');
  console.log('='.repeat(60) + '\n');

  // Run examples in sequence
  await exampleWebSocketURL();
  await exampleDockerOperations();

  // The following examples require Docker to be running
  // Uncomment to run with Docker available:
  // await exampleBasicTranscription();
  // await exampleConnectionPooling();
  // await exampleMultiLanguage();
  // await exampleErrorHandling();

  console.log('='.repeat(60));
  console.log('EXAMPLES COMPLETE');
  console.log('='.repeat(60) + '\n');
}

// Export for testing/CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples().catch(console.error);
}
