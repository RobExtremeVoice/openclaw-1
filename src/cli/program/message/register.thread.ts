import type { Command } from "commander";
import type { MessageCliHelpers } from "./helpers.js";

export function registerMessageThreadCommands(message: Command, helpers: MessageCliHelpers) {
  const thread = message.command("thread").description("Thread actions");

  helpers
    .withMessageBase(
      helpers.withRequiredMessageTarget(
        thread
          .command("create")
          .description("Create a thread")
          .requiredOption("--thread-name <name>", "Thread name"),
      ),
    )
    .option("--message-id <id>", "Message id (optional)")
    .option("--auto-archive-min <n>", "Thread auto-archive minutes")
    .option(
      "--icon-color <color>",
      "Icon color (Telegram: 7322096=blue, 16766590=yellow, 13338331=violet, 9367192=green, 16749490=rose, 16478047=red)",
    )
    .option("--icon-custom-emoji-id <id>", "Custom emoji id for topic icon (Telegram Premium)")
    .action(async (opts) => {
      await helpers.runMessageAction("thread-create", opts);
    });

  helpers
    .withMessageBase(
      thread
        .command("list")
        .description("List threads")
        .requiredOption("--guild-id <id>", "Guild id"),
    )
    .option("--channel-id <id>", "Channel id")
    .option("--include-archived", "Include archived threads", false)
    .option("--before <id>", "Read/search before id")
    .option("--limit <n>", "Result limit")
    .action(async (opts) => {
      await helpers.runMessageAction("thread-list", opts);
    });

  helpers
    .withMessageBase(
      helpers.withRequiredMessageTarget(
        thread
          .command("reply")
          .description("Reply in a thread")
          .requiredOption("-m, --message <text>", "Message body"),
      ),
    )
    .option(
      "--media <path-or-url>",
      "Attach media (image/audio/video/document). Accepts local paths or URLs.",
    )
    .option("--reply-to <id>", "Reply-to message id")
    .action(async (opts) => {
      await helpers.runMessageAction("thread-reply", opts);
    });

  // Telegram forum topic management commands
  helpers
    .withMessageBase(
      helpers.withRequiredMessageTarget(
        thread
          .command("edit")
          .description("Edit a thread/topic (Telegram forums)")
          .requiredOption("--thread-id <id>", "Thread/topic id"),
      ),
    )
    .option("--thread-name <name>", "New thread name")
    .option("--icon-custom-emoji-id <id>", "Custom emoji id for topic icon")
    .action(async (opts) => {
      await helpers.runMessageAction("thread-edit", opts);
    });

  helpers
    .withMessageBase(
      helpers.withRequiredMessageTarget(
        thread
          .command("close")
          .description("Close a thread/topic (Telegram forums)")
          .requiredOption("--thread-id <id>", "Thread/topic id"),
      ),
    )
    .action(async (opts) => {
      await helpers.runMessageAction("thread-close", opts);
    });

  helpers
    .withMessageBase(
      helpers.withRequiredMessageTarget(
        thread
          .command("reopen")
          .description("Reopen a closed thread/topic (Telegram forums)")
          .requiredOption("--thread-id <id>", "Thread/topic id"),
      ),
    )
    .action(async (opts) => {
      await helpers.runMessageAction("thread-reopen", opts);
    });

  helpers
    .withMessageBase(
      helpers.withRequiredMessageTarget(
        thread
          .command("delete")
          .description("Delete a thread/topic and all its messages (Telegram forums)")
          .requiredOption("--thread-id <id>", "Thread/topic id"),
      ),
    )
    .action(async (opts) => {
      await helpers.runMessageAction("thread-delete", opts);
    });
}
