/**
 * OpenClaw Memory (LanceDB) Plugin
 *
 * Long-term memory with vector search for AI conversations.
 * Uses LanceDB for storage and OpenAI for embeddings.
 * Provides seamless auto-recall and auto-capture via lifecycle hooks.
 */

import { Type } from "@sinclair/typebox";
import * as lancedb from "@lancedb/lancedb";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { stringEnum } from "openclaw/plugin-sdk";

import {
  MEMORY_CATEGORIES,
  type MemoryCategory,
  memoryConfigSchema,
  vectorDimsForModel,
} from "./config.js";

// ============================================================================
// Types
// ============================================================================

type MemoryEntry = {
  id: string;
  text: string;
  vector: number[];
  importance: number;
  category: MemoryCategory;
  createdAt: number;
};

type MemorySearchResult = {
  entry: MemoryEntry;
  score: number;
};

// ============================================================================
// LanceDB Provider
// ============================================================================

const TABLE_NAME = "memories";

class MemoryDB {
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(
    private readonly dbPath: string,
    private readonly vectorDim: number,
  ) {}

  private async ensureInitialized(): Promise<void> {
    if (this.table) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    this.db = await lancedb.connect(this.dbPath);
    const tables = await this.db.tableNames();

    if (tables.includes(TABLE_NAME)) {
      this.table = await this.db.openTable(TABLE_NAME);
    } else {
      this.table = await this.db.createTable(TABLE_NAME, [
        {
          id: "__schema__",
          text: "",
          vector: new Array(this.vectorDim).fill(0),
          importance: 0,
          category: "other",
          createdAt: 0,
        },
      ]);
      await this.table.delete('id = "__schema__"');
    }
  }

  async store(
    entry: Omit<MemoryEntry, "id" | "createdAt">,
  ): Promise<MemoryEntry> {
    await this.ensureInitialized();

    const fullEntry: MemoryEntry = {
      ...entry,
      id: randomUUID(),
      createdAt: Date.now(),
    };

    await this.table!.add([fullEntry]);
    return fullEntry;
  }

  async search(
    vector: number[],
    limit = 5,
    minScore = 0.5,
  ): Promise<MemorySearchResult[]> {
    await this.ensureInitialized();

    const results = await this.table!.vectorSearch(vector).limit(limit).toArray();

    // LanceDB uses L2 distance by default; convert to similarity score
    const mapped = results.map((row) => {
      const distance = row._distance ?? 0;
      // Use inverse for a 0-1 range: sim = 1 / (1 + d)
      const score = 1 / (1 + distance);
      return {
        entry: {
          id: row.id as string,
          text: row.text as string,
          vector: row.vector as number[],
          importance: row.importance as number,
          category: row.category as MemoryEntry["category"],
          createdAt: row.createdAt as number,
        },
        score,
      };
    });

    return mapped.filter((r) => r.score >= minScore);
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureInitialized();
    // Validate UUID format to prevent injection
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      throw new Error(`Invalid memory ID format: ${id}`);
    }
    await this.table!.delete(`id = '${id}'`);
    return true;
  }

  async count(): Promise<number> {
    await this.ensureInitialized();
    return this.table!.countRows();
  }
}

// ============================================================================
// LLM Client (Embeddings + Multi-Provider Evaluation)
// ============================================================================

type LLMProvider = "claude" | "gemini" | "openai" | null;

type LLMLogger = {
  warn: (message: string) => void;
};

class LLMClient {
  private openai: OpenAI;
  private anthropic: Anthropic | null = null;
  private gemini: GoogleGenerativeAI | null = null;
  private llmProvider: LLMProvider = null;
  private logger: LLMLogger | null = null;

  constructor(
    apiKey: string,
    private embeddingModel: string,
    logger?: LLMLogger,
  ) {
    this.openai = new OpenAI({ apiKey });
    this.logger = logger ?? null;
    this.initializeLLMProvider();
  }

  private initializeLLMProvider(): void {
    // Priority: Claude > Gemini > OpenAI (since OpenAI is already used for embeddings)
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (anthropicKey) {
      this.anthropic = new Anthropic({ apiKey: anthropicKey });
      this.llmProvider = "claude";
    } else if (geminiKey) {
      this.gemini = new GoogleGenerativeAI(geminiKey);
      this.llmProvider = "gemini";
    } else {
      // Fall back to OpenAI (already initialized for embeddings)
      this.llmProvider = "openai";
    }
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.openai.embeddings.create({
      model: this.embeddingModel,
      input: text,
    });
    return response.data[0].embedding;
  }

  private buildEvaluationPrompt(text: string): string {
    // Escape the user text to prevent prompt injection
    const escapedText = text
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    return `You evaluate conversation messages to decide if they contain information worth remembering long-term about the user.

CAPTURE these types of information:
- Personal facts (name, location, job, family, pets, etc.)
- Preferences (likes, dislikes, favorites, how they want things done)
- Decisions made (technology choices, plans, commitments)
- Important entities (contacts, accounts, projects they mention)
- Goals, habits, or recurring topics

DO NOT CAPTURE:
- Greetings, small talk, or filler
- Questions without personal context
- Generic statements not specific to the user
- Technical explanations or code (unless it reveals a preference)
- Responses that are clearly from an AI assistant

<user_message>
${escapedText}
</user_message>

Respond with JSON only (no markdown, no explanation):
{"capture": true/false, "category": "preference|fact|decision|entity|other", "memory": "concise restatement if capturing"}`;
  }

  async evaluateForCapture(text: string): Promise<{ shouldCapture: boolean; category: MemoryCategory; memory?: string }> {
    if (!this.llmProvider) {
      return { shouldCapture: false, category: "other" };
    }

    const prompt = this.buildEvaluationPrompt(text);

    try {
      let content: string;

      switch (this.llmProvider) {
        case "claude": {
          const response = await this.anthropic!.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 256,
            messages: [{ role: "user", content: prompt }],
          });
          const textBlock = response.content.find((b) => b.type === "text");
          content = textBlock?.type === "text" ? textBlock.text : "";
          break;
        }

        case "gemini": {
          const model = this.gemini!.getGenerativeModel({ model: "gemini-2.0-flash" });
          const result = await model.generateContent(prompt);
          content = result.response.text().trim();
          break;
        }

        case "openai": {
          const response = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            max_tokens: 256,
            messages: [{ role: "user", content: prompt }],
          });
          content = response.choices[0]?.message?.content ?? "";
          break;
        }

        default:
          return { shouldCapture: false, category: "other" };
      }

      const result = parseEvaluationResponse(content, MEMORY_CATEGORIES);
      return {
        shouldCapture: result.shouldCapture,
        category: result.category as MemoryCategory,
        memory: result.memory,
      };
    } catch (err) {
      this.logger?.warn(`memory-lancedb: LLM evaluation failed: ${String(err)}`);
      return { shouldCapture: false, category: "other" };
    }
  }

  getProvider(): LLMProvider {
    return this.llmProvider;
  }
}

// ============================================================================
// Basic pre-filters (cheap checks before LLM call)
// ============================================================================

/**
 * Pre-filter to decide if a message should be sent to LLM for evaluation.
 * Filters out system content, very short/long messages, and AI-generated content.
 */
export function shouldEvaluate(text: string): boolean {
  // Skip very short or very long messages
  if (text.length < 15 || text.length > 1000) return false;
  // Skip injected context from memory recall
  if (text.includes("<relevant-memories>")) return false;
  // Skip system-generated content (XML tags)
  if (text.startsWith("<") && text.includes("</")) return false;
  // Skip heavy markdown (likely AI-generated summaries)
  if ((text.match(/\*\*/g) || []).length > 4) return false;
  return true;
}

/**
 * Parse LLM evaluation response, handling potential markdown code blocks.
 * Exported for testing.
 */
export function parseEvaluationResponse(
  content: string,
  validCategories: readonly string[],
): { shouldCapture: boolean; category: string; memory?: string } {
  const jsonStr = content.replace(/```json\n?|\n?```/g, "").trim();
  const parsed = JSON.parse(jsonStr);

  return {
    shouldCapture: parsed.capture === true,
    category: validCategories.includes(parsed.category) ? parsed.category : "other",
    memory: parsed.memory,
  };
}

// ============================================================================
// Plugin Definition
// ============================================================================

const memoryPlugin = {
  id: "memory-lancedb",
  name: "Memory (LanceDB)",
  description: "LanceDB-backed long-term memory with auto-recall/capture",
  kind: "memory" as const,
  configSchema: memoryConfigSchema,

  register(api: OpenClawPluginApi) {
    const cfg = memoryConfigSchema.parse(api.pluginConfig);
    const resolvedDbPath = api.resolvePath(cfg.dbPath!);
    const vectorDim = vectorDimsForModel(cfg.embedding.model ?? "text-embedding-3-small");
    const db = new MemoryDB(resolvedDbPath, vectorDim);
    const llm = new LLMClient(cfg.embedding.apiKey, cfg.embedding.model!, api.logger);
    const llmProvider = llm.getProvider();

    api.logger.info(
      `memory-lancedb: plugin registered (db: ${resolvedDbPath}, llm: ${llmProvider ?? "none"})`,
    );

    // ========================================================================
    // Tools
    // ========================================================================

    api.registerTool(
      {
        name: "memory_recall",
        label: "Memory Recall",
        description:
          "Search through long-term memories. Use when you need context about user preferences, past decisions, or previously discussed topics.",
        parameters: Type.Object({
          query: Type.String({ description: "Search query" }),
          limit: Type.Optional(Type.Number({ description: "Max results (default: 5)" })),
        }),
        async execute(_toolCallId, params) {
          const { query, limit = 5 } = params as { query: string; limit?: number };

          const vector = await llm.embed(query);
          const results = await db.search(vector, limit, 0.1);

          if (results.length === 0) {
            return {
              content: [{ type: "text", text: "No relevant memories found." }],
              details: { count: 0 },
            };
          }

          const text = results
            .map(
              (r, i) =>
                `${i + 1}. [${r.entry.category}] ${r.entry.text} (${(r.score * 100).toFixed(0)}%)`,
            )
            .join("\n");

          // Strip vector data for serialization (typed arrays can't be cloned)
          const sanitizedResults = results.map((r) => ({
            id: r.entry.id,
            text: r.entry.text,
            category: r.entry.category,
            importance: r.entry.importance,
            score: r.score,
          }));

          return {
            content: [
              { type: "text", text: `Found ${results.length} memories:\n\n${text}` },
            ],
            details: { count: results.length, memories: sanitizedResults },
          };
        },
      },
      { name: "memory_recall" },
    );

    api.registerTool(
      {
        name: "memory_store",
        label: "Memory Store",
        description:
          "Save important information in long-term memory. Use for preferences, facts, decisions.",
        parameters: Type.Object({
          text: Type.String({ description: "Information to remember" }),
          importance: Type.Optional(
            Type.Number({ description: "Importance 0-1 (default: 0.7)" }),
          ),
          category: Type.Optional(stringEnum(MEMORY_CATEGORIES)),
        }),
        async execute(_toolCallId, params) {
          const {
            text,
            importance = 0.7,
            category = "other",
          } = params as {
            text: string;
            importance?: number;
            category?: MemoryEntry["category"];
          };

          const vector = await llm.embed(text);

          // Check for duplicates
          const existing = await db.search(vector, 1, 0.95);
          if (existing.length > 0) {
            return {
              content: [
                { type: "text", text: `Similar memory already exists: "${existing[0].entry.text}"` },
              ],
              details: { action: "duplicate", existingId: existing[0].entry.id, existingText: existing[0].entry.text },
            };
          }

          const entry = await db.store({
            text,
            vector,
            importance,
            category,
          });

          return {
            content: [{ type: "text", text: `Stored: "${text.slice(0, 100)}..."` }],
            details: { action: "created", id: entry.id },
          };
        },
      },
      { name: "memory_store" },
    );

    api.registerTool(
      {
        name: "memory_forget",
        label: "Memory Forget",
        description: "Delete specific memories. GDPR-compliant.",
        parameters: Type.Object({
          query: Type.Optional(Type.String({ description: "Search to find memory" })),
          memoryId: Type.Optional(Type.String({ description: "Specific memory ID" })),
        }),
        async execute(_toolCallId, params) {
          const { query, memoryId } = params as { query?: string; memoryId?: string };

          if (memoryId) {
            await db.delete(memoryId);
            return {
              content: [{ type: "text", text: `Memory ${memoryId} forgotten.` }],
              details: { action: "deleted", id: memoryId },
            };
          }

          if (query) {
            const vector = await llm.embed(query);
            const results = await db.search(vector, 5, 0.7);

            if (results.length === 0) {
              return {
                content: [{ type: "text", text: "No matching memories found." }],
                details: { found: 0 },
              };
            }

            if (results.length === 1 && results[0].score > 0.9) {
              await db.delete(results[0].entry.id);
              return {
                content: [
                  { type: "text", text: `Forgotten: "${results[0].entry.text}"` },
                ],
                details: { action: "deleted", id: results[0].entry.id },
              };
            }

            const list = results
              .map((r) => `- [${r.entry.id.slice(0, 8)}] ${r.entry.text.slice(0, 60)}...`)
              .join("\n");

            // Strip vector data for serialization
            const sanitizedCandidates = results.map((r) => ({
              id: r.entry.id,
              text: r.entry.text,
              category: r.entry.category,
              score: r.score,
            }));

            return {
              content: [
                {
                  type: "text",
                  text: `Found ${results.length} candidates. Specify memoryId:\n${list}`,
                },
              ],
              details: { action: "candidates", candidates: sanitizedCandidates },
            };
          }

          return {
            content: [{ type: "text", text: "Provide query or memoryId." }],
            details: { error: "missing_param" },
          };
        },
      },
      { name: "memory_forget" },
    );

    // ========================================================================
    // CLI Commands
    // ========================================================================

    api.registerCli(
      ({ program }) => {
        const memory = program
          .command("ltm")
          .description("LanceDB memory plugin commands");

        memory
          .command("list")
          .description("List memories")
          .action(async () => {
            const count = await db.count();
            console.log(`Total memories: ${count}`);
          });

        memory
          .command("search")
          .description("Search memories")
          .argument("<query>", "Search query")
          .option("--limit <n>", "Max results", "5")
          .action(async (query, opts) => {
            const vector = await llm.embed(query);
            const results = await db.search(vector, parseInt(opts.limit), 0.3);
            // Strip vectors for output
            const output = results.map((r) => ({
              id: r.entry.id,
              text: r.entry.text,
              category: r.entry.category,
              importance: r.entry.importance,
              score: r.score,
            }));
            console.log(JSON.stringify(output, null, 2));
          });

        memory
          .command("stats")
          .description("Show memory statistics")
          .action(async () => {
            const count = await db.count();
            console.log(`Total memories: ${count}`);
          });
      },
      { commands: ["ltm"] },
    );

    // ========================================================================
    // Lifecycle Hooks
    // ========================================================================

    // Auto-recall: inject relevant memories before agent starts
    if (cfg.autoRecall) {
      api.on("before_agent_start", async (event) => {
        if (!event.prompt || event.prompt.length < 5) return;

        try {
          const vector = await llm.embed(event.prompt);
          const results = await db.search(vector, 3, 0.3);

          if (results.length === 0) return;

          const memoryContext = results
            .map((r) => `- [${r.entry.category}] ${r.entry.text}`)
            .join("\n");

          api.logger.info?.(
            `memory-lancedb: injecting ${results.length} memories into context`,
          );

          return {
            prependContext: `<relevant-memories>\nThe following memories may be relevant to this conversation:\n${memoryContext}\n</relevant-memories>`,
          };
        } catch (err) {
          api.logger.warn(`memory-lancedb: recall failed: ${String(err)}`);
        }
      });
    }

    // Auto-capture: analyze and store important information after agent ends
    if (cfg.autoCapture) {
      api.on("agent_end", async (event) => {
        if (!event.success || !event.messages || event.messages.length === 0) {
          return;
        }

        try {
          // Extract text content from messages (handling unknown[] type)
          const texts: string[] = [];
          for (const msg of event.messages) {
            // Type guard for message object
            if (!msg || typeof msg !== "object") continue;
            const msgObj = msg as Record<string, unknown>;

            // Only process user and assistant messages
            const role = msgObj.role;
            if (role !== "user" && role !== "assistant") continue;

            const content = msgObj.content;

            // Handle string content directly
            if (typeof content === "string") {
              texts.push(content);
              continue;
            }

            // Handle array content (content blocks)
            if (Array.isArray(content)) {
              for (const block of content) {
                if (
                  block &&
                  typeof block === "object" &&
                  "type" in block &&
                  (block as Record<string, unknown>).type === "text" &&
                  "text" in block &&
                  typeof (block as Record<string, unknown>).text === "string"
                ) {
                  texts.push((block as Record<string, unknown>).text as string);
                }
              }
            }
          }

          // Pre-filter texts (cheap checks before LLM evaluation)
          const candidates = texts.filter(
            (text) => text && shouldEvaluate(text),
          );
          if (candidates.length === 0) return;

          // Evaluate and store using LLM (limit to 5 candidates per conversation)
          let stored = 0;
          for (const text of candidates.slice(0, 5)) {
            // Ask LLM if this is worth remembering
            const evaluation = await llm.evaluateForCapture(text);
            if (!evaluation.shouldCapture) continue;

            // Use the LLM's restatement if provided, otherwise use original
            const memoryText = evaluation.memory || text;
            const vector = await llm.embed(memoryText);

            // Check for duplicates (high similarity threshold)
            const existing = await db.search(vector, 1, 0.90);
            if (existing.length > 0) continue;

            await db.store({
              text: memoryText,
              vector,
              importance: 0.7,
              category: evaluation.category,
            });
            stored++;

            // Limit to 3 stored per conversation to avoid runaway costs
            if (stored >= 3) break;
          }

          if (stored > 0) {
            api.logger.info(`memory-lancedb: auto-captured ${stored} memories`);
          }
        } catch (err) {
          api.logger.warn(`memory-lancedb: capture failed: ${String(err)}`);
        }
      });
    }

    // ========================================================================
    // Service
    // ========================================================================

    api.registerService({
      id: "memory-lancedb",
      start: () => {
        api.logger.info(
          `memory-lancedb: initialized (db: ${resolvedDbPath}, model: ${cfg.embedding.model})`,
        );
      },
      stop: () => {
        api.logger.info("memory-lancedb: stopped");
      },
    });
  },
};

export default memoryPlugin;
