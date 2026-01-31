/**
 * Feishu End-to-End Test Script
 * 
 * 功能：
 * 1. 建立长连接接收消息
 * 2. 收到消息后自动回复
 * 3. 支持多种消息类型
 * 
 * 使用方法：
 * APP_ID=cli_xxx APP_SECRET=xxx npx tsx src/feishu/test-e2e.ts
 */

import * as lark from "@larksuiteoapi/node-sdk";

import { loadConfig } from "../config/config.js";
import { resolveFeishuAccount, resolveDefaultFeishuAccountId } from "./accounts.js";

// ========== 配置 ==========
const cfg = loadConfig();
const accountId = process.env.ACCOUNT_ID || resolveDefaultFeishuAccountId(cfg);
let APP_ID = "";
let APP_SECRET = "";

if (accountId) {
    try {
        const account = resolveFeishuAccount({ cfg, accountId });
        APP_ID = account.appId || "";
        APP_SECRET = account.appSecret || "";
        console.log(`✅ Loaded configuration for account: ${accountId}`);
    } catch (e) {
        console.warn(`⚠️ Failed to load account ${accountId}: ${e}`);
    }
}

// Fallback to Env
if (!APP_ID) APP_ID = process.env.APP_ID || process.env.FEISHU_APP_ID || "";
if (!APP_SECRET) APP_SECRET = process.env.APP_SECRET || process.env.FEISHU_APP_SECRET || "";

if (!APP_ID || !APP_SECRET) {
    console.error("❌ 错误: 未找到飞书配置");
    console.error("   请确保 openclaw.json 已配置或设置 APP_ID/APP_SECRET 环境变量");
    process.exit(1);
}

console.log("🤖 飞书端到端测试 (收发消息)");
console.log("================================\n");
console.log(`   App ID: ${APP_ID.substring(0, 10)}...`);
console.log("");

// ========== 创建客户端 ==========
const client = new lark.Client({
    appId: APP_ID,
    appSecret: APP_SECRET,
    appType: lark.AppType.SelfBuild,
    domain: lark.Domain.Feishu,
});

// ========== 消息处理 ==========
interface MessageContent {
    text?: string;
}

interface MessageEvent {
    sender: {
        sender_id: {
            open_id: string;
            user_id?: string;
            union_id?: string;
        };
        sender_type: string;
        tenant_key: string;
    };
    message: {
        message_id: string;
        root_id?: string;
        parent_id?: string;
        create_time: string;
        chat_id: string;
        chat_type: string;
        message_type: string;
        content: string;
        mentions?: Array<{
            key: string;
            id: { open_id: string };
            name: string;
        }>;
    };
}

/**
 * 解析消息内容
 */
function parseMessageContent(content: string, messageType: string): string {
    try {
        if (messageType === "text") {
            const parsed = JSON.parse(content) as MessageContent;
            return parsed.text || "";
        }
        return `[${messageType} 消息]`;
    } catch {
        return content;
    }
}

/**
 * 生成回复内容
 */
function generateReply(text: string, senderType: string): string {
    const timestamp = new Date().toLocaleTimeString("zh-CN");

    // 简单的回复逻辑
    if (text.includes("你好") || text.includes("hi") || text.includes("hello")) {
        return `你好！我是 OpenClaw Bot 🤖\n\n当前时间: ${timestamp}`;
    }

    if (text.includes("帮助") || text.includes("help")) {
        return `🔧 OpenClaw Bot 帮助\n\n支持的命令:\n• 你好 - 打招呼\n• 帮助 - 显示此帮助\n• 其他消息 - 回显消息\n\n当前时间: ${timestamp}`;
    }

    // 默认回显
    return `收到你的消息: "${text}"\n\n[Echo from OpenClaw Bot @ ${timestamp}]`;
}

/**
 * 回复消息
 */
async function replyToMessage(messageId: string, text: string): Promise<void> {
    try {
        const response = await client.im.message.reply({
            path: { message_id: messageId },
            data: {
                msg_type: "text",
                content: JSON.stringify({ text }),
            },
        });

        if (response.code === 0) {
            console.log(`   ✅ 回复成功: ${response.data?.message_id}`);
        } else {
            console.log(`   ⚠️ 回复失败: ${response.code} - ${response.msg}`);
        }
    } catch (error) {
        console.log(`   ❌ 回复错误: ${error}`);
    }
}

/**
 * 处理消息事件
 */
async function handleMessage(event: MessageEvent): Promise<void> {
    const { sender, message } = event;
    const content = parseMessageContent(message.content, message.message_type);

    console.log("\n📨 收到消息:");
    console.log(`   发送者: ${sender.sender_id.open_id} (${sender.sender_type})`);
    console.log(`   聊天ID: ${message.chat_id} (${message.chat_type})`);
    console.log(`   消息ID: ${message.message_id}`);
    console.log(`   类型: ${message.message_type}`);
    console.log(`   内容: ${content}`);

    // 生成并发送回复
    if (message.message_type === "text" && content) {
        const reply = generateReply(content, sender.sender_type);
        console.log(`\n💬 发送回复...`);
        await replyToMessage(message.message_id, reply);
    }
}

// ========== 事件分发器 ==========
const eventDispatcher = new lark.EventDispatcher({}).register({
    "im.message.receive_v1": async (data) => {
        try {
            const event = data as unknown as MessageEvent;
            await handleMessage(event);
        } catch (error) {
            console.error("处理消息时出错:", error);
        }
        return {};
    },
});

// ========== 启动长连接 ==========
console.log("1️⃣ 创建 WebSocket 客户端...");

const wsClient = new lark.WSClient({
    appId: APP_ID,
    appSecret: APP_SECRET,
    loggerLevel: lark.LoggerLevel.info,
});

console.log("2️⃣ 启动长连接...\n");

// 注意：eventDispatcher 需要传给 start() 方法
wsClient.start({ eventDispatcher });

console.log("================================");
console.log("🎉 机器人已就绪！在飞书中发送消息测试");
console.log("   按 Ctrl+C 退出");
console.log("================================\n");

// ========== 优雅退出 ==========
process.on("SIGINT", () => {
    console.log("\n\n👋 正在关闭...");
    process.exit(0);
});

process.on("SIGTERM", () => {
    console.log("\n\n👋 正在关闭...");
    process.exit(0);
});
