/**
 * LINEリプライ形式
 *
 * 元メッセージを引用してLINE Messaging APIで返信する
 */

import type {
  ReplyMessageRequest,
  Message as LineMessage,
  Client as LineClient,
} from "@line/lubots";

import type {
  ReplyOptions,
  ReplyData,
  ResponseFormat,
  QuoteMetadata,
  ReplyAuthor,
} from "./types.js";

/**
 * LINEリプライオプション拡張
 */
export interface LineReplyOptions extends ReplyOptions {
  /** LINEクライアント */
  client: LineClient;
  /** 返信トークン */
  replyToken: string;
}

/**
 * LINE Flex Messageテンプレート
 */
interface FlexMessageTemplate {
  type: "flex";
  altText: string;
  contents: {
    type: "bubble";
    header?: {
      type: "box";
      layout: "horizontal";
      contents: [
        {
          type: "text";
          text: string;
          weight: "bold";
          size: "lg";
        },
      ];
    };
    body: {
      type: "box";
      layout: "vertical";
      contents: LineFlexContent[];
    };
    footer?: {
      type: "box";
      layout: "horizontal";
      contents: LineFlexContent[];
    };
  };
}

/**
 * Flexコンテンツ
 */
type LineFlexContent =
  | { type: "text"; text: string; size?: string; weight?: string; color?: string }
  | { type: "box"; layout: "horizontal" | "vertical"; contents: LineFlexContent[] }
  | { type: "separator"; margin: string };

/**
 * LINE引用形式を作成
 */
function buildLineQuote(quote: QuoteMetadata): string {
  const lines: string[] = [];

  // 送信者情報
  const authorTag = quote.author.bot ? `${quote.author.name} (bot)` : quote.author.name;
  const timestamp = new Date(quote.timestamp).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour12: false,
  });

  lines.push(`[${timestamp}] ${authorTag}さん`);
  lines.push(""); // 空行

  // 元メッセージテキスト
  const quotedText = quote.originalText
    .split("\n")
    .map((line) => `│ ${line}`)
    .join("\n");

  lines.push(quotedText);
  lines.push(""); // 空行で引用終了
  lines.push("─"); // 区切り線

  return lines.join("\n");
}

/**
 * Flex Messageを作成
 */
function buildFlexMessage(quote: QuoteMetadata, responseText: string): FlexMessageTemplate {
  const authorTag = quote.author.name;
  const timestamp = new Date(quote.timestamp).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour12: false,
  });

  // 元メッセージを引用部分として構築
  const quotedText = quote.originalText.slice(0, 100); // 文字数制限
  const ellipsis = quote.originalText.length > 100 ? "..." : "";

  return {
    type: "flex",
    altText: "返信メッセージ",
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "horizontal",
        contents: [
          {
            type: "text",
            text: `💬 ${authorTag}さん`,
            weight: "bold",
            size: "lg",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: `[${timestamp}]`,
            size: "xs",
            color: "#888888",
          },
          {
            type: "separator",
            margin: "md",
          },
          {
            type: "text",
            text: `${quotedText}${ellipsis}`,
            size: "sm",
          },
          {
            type: "separator",
            margin: "md",
          },
          {
            type: "text",
            text: responseText,
          },
        ],
      },
    },
  };
}

/**
 * LINEに返信
 *
 * @param replyData - 返信データ
 * @param options - オプション
 */
export async function sendLineReply(
  replyData: ReplyData,
  options: LineReplyOptions,
): Promise<void> {
  const { client, replyToken } = options;

  // 引用メタデータ構築
  const quote: QuoteMetadata = {
    messageId: "", // LINEのメッセージIDは不要
    originalText: "", // TODO: 元メッセージから取得
    author: options.author || {
      name: "Unknown",
      userId: "",
    },
    timestamp: options.timestamp ?? Date.now(),
  };

  const messages: LineMessage[] = [];

  // フォーマット別にメッセージ構築
  if (options.format === ResponseFormat.FLEX) {
    const flexMessage = buildFlexMessage(quote, replyData.text ?? "");
    messages.push(flexMessage as LineMessage);
  } else {
    // テキスト形式（引用付き）
    const content = buildLineQuote(quote) + (replyData.text ?? "");
    messages.push({ type: "text", text: content });
  }

  // ファイル添付がある場合
  if (options.fileUrls && options.fileUrls.length > 0) {
    for (const fileUrl of options.fileUrls) {
      messages.push({
        type: "image",
        originalContentUrl: fileUrl,
      });
    }
  }

  // リプライ送信
  await client.replyMessage(replyToken, { messages });
}

/**
 * LINEメッセージからリプライデータを生成
 *
 * @param originalEvent - 元イベント
 * @param responseText - 返信テキスト
 * @param options - オプション
 * @returns リプライデータ
 */
export function createLineReply(
  originalEvent: { replyToken?: string; source?: { userId?: string } },
  responseText: string,
  options: Partial<ReplyOptions> = {},
): { data: ReplyData; options: LineReplyOptions } {
  const author: ReplyAuthor = {
    name: "User", // LINEはユーザー名を取得できない場合がある
    userId: originalEvent?.source?.userId,
  };

  const replyData: ReplyData = {
    text: responseText,
    options: {
      format: ResponseFormat.TEXT,
      ...options,
    },
  };

  return {
    data: replyData,
    options: {
      ...options,
      author,
      timestamp: Date.now(),
      replyToken: originalEvent.replyToken ?? "",
    } as LineReplyOptions,
  };
}
