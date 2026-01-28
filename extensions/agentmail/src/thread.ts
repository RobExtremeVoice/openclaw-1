import type { AgentMailClient, AgentMail } from "agentmail";

import { formatAttachments } from "./attachment.js";
import { formatUtcDate, type Message } from "./utils.js";

type Thread = AgentMail.threads.Thread;

/**
 * Extracts the body text from a message, preferring extractedText.
 * extractedText contains only new content (excluding quoted replies).
 */
export function extractMessageBody(
  msg: Pick<Message, "extractedText" | "extractedHtml" | "text" | "html">
): string {
  return msg.extractedText ?? msg.extractedHtml ?? msg.text ?? msg.html ?? "";
}

function formatThreadHeader(thread: Thread): string {
  return [
    thread.subject && `Subject: ${thread.subject}`,
    `Senders: ${thread.senders.join(", ")}`,
    `Recipients: ${thread.recipients.join(", ")}`,
    `Messages: ${thread.messageCount}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatMessageRecipients(msg: Message): string {
  return [
    `To: ${msg.to.join(", ")}`,
    msg.cc?.length && `Cc: ${msg.cc.join(", ")}`,
    msg.bcc?.length && `Bcc: ${msg.bcc.join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatMessage(msg: Message): string {
  const attachments = formatAttachments(msg.attachments);
  return [
    `--- ${formatUtcDate(msg.createdAt)} ---`,
    `From: ${msg.from}`,
    formatMessageRecipients(msg),
    attachments,
    "",
    extractMessageBody(msg),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Fetches and formats the thread as context for the agent.
 * Returns empty string if fetch fails.
 */
export async function fetchFormattedThread(
  client: AgentMailClient,
  inboxId: string,
  threadId: string
): Promise<string> {
  try {
    const thread = await client.inboxes.threads.get(inboxId, threadId);

    if (thread.messages.length === 0) {
      return "";
    }

    const header = formatThreadHeader(thread);
    const messages = thread.messages.map(formatMessage).join("\n\n");

    return `${header}\n\n${messages}`;
  } catch {
    // Caller handles fallback to event message
    return "";
  }
}
