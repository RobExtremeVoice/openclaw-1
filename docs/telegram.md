# Telegram Integration

## Overview

warelay now supports Telegram via the MTProto client library (GramJS), allowing you to use your personal Telegram account for automated messaging. This provides the same personal automation capabilities as WhatsApp Web, but for Telegram conversations.

## Setup

### 1. Get API Credentials

Register a new application at **https://my.telegram.org/apps** to get:
- **API ID** (numeric, e.g., `12345678`)
- **API Hash** (hexadecimal string, e.g., `abcdef0123456789abcdef0123456789`)

**Important:** These credentials are for your personal use only. Never share them publicly or commit them to version control.

### 2. Configure Environment

Add to `.env`:
```bash
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH=abcdef0123456789abcdef0123456789
```

### 3. Login

```bash
warelay login --provider telegram
```

You'll be prompted for:
1. **Phone number** (with country code, e.g., `+15551234567`)
2. **SMS verification code** (sent to your Telegram app or SMS)
3. **2FA password** (if you have two-factor authentication enabled)

Session is saved to `~/.warelay/telegram/session/` and persists across restarts.

### 4. Configure Whitelist (Optional)

In `~/.warelay/warelay.json`:
```json5
{
  telegram: {
    // Only these users can trigger auto-replies
    allowFrom: [
      "@username",        // Telegram username (with @)
      "+1234567890",      // Phone number (with +)
      "123456789"         // User ID (numeric)
    ]
  }
}
```

**Security note:** If `allowFrom` is empty or omitted, all incoming messages will trigger auto-replies. Use a whitelist in production.

## CLI Usage

### Send Messages

**Text message:**
```bash
warelay send --provider telegram --to @username --message "Hello from warelay"
```

**To a user by phone number:**
```bash
warelay send --provider telegram --to +15551234567 --message "Hi!"
```

**To a user by numeric ID:**
```bash
warelay send --provider telegram --to 123456789 --message "Hi!"
```

**With media:**
```bash
warelay send --provider telegram --to @username \
  --message "Check this out" \
  --media ./image.jpg
```

**With media URL:**
```bash
warelay send --provider telegram --to @username \
  --message "Look at this" \
  --media https://example.com/image.jpg
```

### Start Relay (Auto-Reply)

```bash
warelay relay --provider telegram --verbose
```

The relay will:
- Connect to Telegram via MTProto
- Listen for incoming messages
- Send typing indicators while processing
- Auto-reply based on your configuration
- Persist sessions across conversations

### Check Status

```bash
warelay status --provider telegram --limit 20 --lookback 240
```

Shows recent sent/received messages with delivery status.

### Logout

```bash
warelay logout --provider telegram
```

Removes the saved session from `~/.warelay/telegram/session/`.

## Features

| Feature | Supported | Notes |
|---------|-----------|-------|
| Text messages | ✅ | Full UTF-8 support, including emoji |
| Media (images, video, audio) | ⚠️ | Up to 2 GB supported, but files >500MB may cause memory issues (buffers entire file) |
| Typing indicators | ✅ | Shows "typing..." while processing |
| Replies | ✅ | Reply to specific messages |
| Message formatting | ✅ | Markdown and HTML formatting |
| Max media size | 2 GB | Enforced when Content-Length available; ⚠️ large files buffered in memory |
| Delivery receipts | ❌ | MTProto limitation (no sent/delivered/read states) |
| Read receipts | ❌ | Not exposed via Provider interface |
| Reactions | ❌ | Not exposed via Provider interface (requires peer context) |
| Editing | ❌ | Not exposed via Provider interface (requires peer context) |
| Deleting | ❌ | Not exposed via Provider interface (requires peer context) |
| Group chats | ⚠️ | Not yet implemented (planned) |

**Note on advanced features:** While Telegram's MTProto API supports reactions, editing, and deleting messages, these features require maintaining peer context (chat/user entity references) which the current Provider interface architecture doesn't support. These features may be added in a future Provider interface revision.

## Security Model

### Personal Account Automation

Telegram integration uses **MTProto client** (not Bot API), which means:
- You're using your personal Telegram account as an automation tool
- All messages appear as coming from you (your name, profile picture)
- You have full access to your conversations and contacts
- No bot limitations (can initiate conversations, see full message history)

### Whitelist Filtering

Control who can trigger auto-replies via `allowFrom` config:

```json5
{
  telegram: {
    allowFrom: ["@alice", "@bob", "123456789"]
  }
}
```

- **Username** (`@alice`): Match by Telegram username
- **Phone number** (`+15551234567`): Match by phone number
- **User ID** (`123456789`): Match by numeric Telegram user ID

If `allowFrom` is empty or omitted, **all messages trigger auto-replies** (use with caution).

### Session Storage

Session files are stored encrypted at `~/.warelay/telegram/session/`:
- Contains authentication tokens and keys
- Persists across restarts
- Should be treated as sensitive (equivalent to login credentials)
- Backup recommended if running in production

### MTProto End-to-End Encryption

- All communication uses Telegram's MTProto protocol
- Messages are encrypted in transit
- Secret chats (end-to-end encrypted) are not supported by the client library

## Troubleshooting

### "No Telegram session found"

**Problem:** You haven't logged in yet.

**Solution:**
```bash
warelay login --provider telegram
```

### "Telegram not configured"

**Problem:** Missing `TELEGRAM_API_ID` or `TELEGRAM_API_HASH` in `.env`.

**Solution:**
1. Get credentials from https://my.telegram.org/apps
2. Add them to `.env`:
   ```bash
   TELEGRAM_API_ID=12345678
   TELEGRAM_API_HASH=your_hash_here
   ```

### "Could not resolve entity"

**Problem:** The username, phone number, or user ID is invalid or not found.

**Solution:** Check the identifier format:
- Usernames must start with `@` (e.g., `@username`)
- Phone numbers must start with `+` (e.g., `+15551234567`)
- User IDs are numeric (e.g., `123456789`)

**Tip:** You can get a user's ID by sending them a message and checking the logs with `--verbose`.

### Re-authentication needed

**Problem:** Session expired or was invalidated.

**Solution:**
```bash
warelay logout --provider telegram
warelay login --provider telegram
```

### "FLOOD_WAIT" error

**Problem:** You're sending too many requests too quickly (rate limited by Telegram).

**Solution:**
- Wait the specified number of seconds before retrying
- Reduce message frequency
- Implement delays between sends

### Session corruption

**Problem:** Session file is corrupted or invalid.

**Solution:**
```bash
# Remove corrupted session
rm -rf ~/.warelay/telegram/session/

# Re-login
warelay login --provider telegram
```

## Configuration Examples

### Simple Text Auto-Reply

```json5
{
  telegram: {
    allowFrom: ["@alice", "@bob"]
  },
  inbound: {
    reply: {
      mode: "text",
      text: "Thanks for your message! I'll get back to you soon."
    }
  }
}
```

### Claude-Powered Assistant

```json5
{
  telegram: {
    allowFrom: ["@alice", "+15551234567"]
  },
  inbound: {
    reply: {
      mode: "command",
      bodyPrefix: "You are a helpful assistant on Telegram. Be concise.\n\n",
      command: ["claude", "--dangerously-skip-permissions", "{{BodyStripped}}"],
      claudeOutputFormat: "text",
      session: {
        scope: "per-sender",
        resetTriggers: ["/new"],
        idleMinutes: 60
      }
    }
  }
}
```

### Per-Sender Sessions with Heartbeats

```json5
{
  telegram: {
    allowFrom: ["@alice", "@bob", "@charlie"]
  },
  inbound: {
    reply: {
      mode: "command",
      command: ["claude", "{{BodyStripped}}"],
      claudeOutputFormat: "text",
      session: {
        scope: "per-sender",
        resetTriggers: ["/new", "/reset"],
        idleMinutes: 120,
        heartbeatIdleMinutes: 10
      },
      heartbeatMinutes: 15
    }
  }
}
```

## Comparison with WhatsApp

| Feature | WhatsApp Web | WhatsApp Twilio | Telegram |
|---------|--------------|-----------------|----------|
| **Authentication** | QR code scan | API credentials | Phone + SMS + 2FA |
| **Account Type** | Personal | Business | Personal |
| **Protocol** | WebSocket (Baileys) | HTTP (Twilio API) | MTProto (GramJS) |
| **Max file size** | 100 MB | 5 MB | 2 GB |
| **Typing indicators** | ✅ | ✅ | ✅ |
| **Read receipts** | ✅ | ❌ | ❌ |
| **Delivery tracking** | Limited | Full | Limited |
| **Group chats** | ✅ | ✅ | ⚠️ (planned) |
| **Reactions** | ❌ | ❌ | ❌ |
| **Edit messages** | ❌ | ❌ | ❌ |
| **Delete messages** | ✅ | ✅ | ❌ |
| **Cost** | Free | Pay per message | Free |

**Note:** Telegram's MTProto API technically supports reactions, edits, and deletes, but these are not exposed via the Provider interface (requires peer context architecture changes).

## Best Practices

### 1. Use a Dedicated Account

Consider using a separate Telegram account for automation:
- Reduces risk to your primary account
- Easier to manage rate limits
- Clearer separation of personal and automated messages

### 2. Implement Rate Limiting

Telegram has rate limits for personal accounts:
- Avoid sending bursts of messages
- Space sends by a few seconds
- Handle `FLOOD_WAIT` errors gracefully

### 3. Backup Your Session

Session files contain authentication tokens:
```bash
# Backup
cp -r ~/.warelay/telegram/session/ ~/backups/warelay-telegram-session/

# Restore
cp -r ~/backups/warelay-telegram-session/ ~/.warelay/telegram/session/
```

### 4. Monitor Logs

Run with `--verbose` to see detailed activity:
```bash
warelay relay --provider telegram --verbose
```

Logs include:
- Connection status
- Inbound/outbound messages
- Session management
- Error details

### 5. Secure Your Credentials

- Never commit `.env` to version control
- Treat `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` as secrets
- Store session backups securely
- Use `allowFrom` whitelist in production

## Advanced Usage

### Running Multiple Providers

You can run WhatsApp and Telegram relays simultaneously:

**Terminal 1 (WhatsApp):**
```bash
tmux new -s warelay-whatsapp -d "warelay relay --provider wa-web --verbose"
```

**Terminal 2 (Telegram):**
```bash
tmux new -s warelay-telegram -d "warelay relay --provider telegram --verbose"
```

### Custom Session Storage

Override session path in config:
```json5
{
  telegram: {
    sessionPath: "/custom/path/to/session/"
  }
}
```

### Verbose Output

Get detailed logs for debugging:
```bash
warelay relay --provider telegram --verbose
```

Output includes:
- MTProto connection events
- Message send/receive details
- Session state changes
- Error stack traces

## Limitations

### Current Limitations

1. **Group chats not yet supported** - Only 1-on-1 conversations work currently (group support planned)
2. **No delivery receipts** - MTProto doesn't provide sent/delivered/read states like Twilio
3. **No secret chats** - End-to-end encrypted "Secret Chats" are not supported by GramJS
4. **Rate limits** - Personal accounts have rate limits (use with moderation)

### Media Handling

**Streaming Implementation**

Media downloads use streaming to temporary files, eliminating memory buffering:

- Files downloaded to `~/.warelay/telegram-temp`
- No memory spike regardless of file size
- Automatic cleanup after send (success or failure)
- Orphaned files cleaned on process restart (1 hour TTL)

**Disk Usage:**
- Temp file created during download
- Cleaned immediately after send
- Max disk usage: size of largest concurrent download

**Performance:**
- No memory overhead for large files
- Same download speed as before
- Proper backpressure handling via Node.js streams

**Production Safety:**
Set `TELEGRAM_MAX_MEDIA_MB` to limit disk usage:
```bash
# Limit to 500MB for production
TELEGRAM_MAX_MEDIA_MB=500 warelay relay --provider telegram
```

**Note:** The limit is read at process startup. Changing the env var requires restarting the relay.

### Known Issues

- Session may expire if not used for extended periods (re-login required)
- Username changes won't be reflected in `allowFrom` until relay restart

## Resources

- **Get API credentials:** https://my.telegram.org/apps
- **Telegram API documentation:** https://core.telegram.org/api
- **GramJS library:** https://gram.js.org/
- **MTProto protocol:** https://core.telegram.org/mtproto

## Migration from Other Providers

### From WhatsApp Web

1. Keep your WhatsApp Web configuration
2. Add Telegram credentials to `.env`
3. Run `warelay login --provider telegram`
4. Start Telegram relay alongside WhatsApp:
   ```bash
   # WhatsApp relay (terminal 1)
   warelay relay --provider wa-web --verbose

   # Telegram relay (terminal 2)
   warelay relay --provider telegram --verbose
   ```

### From WhatsApp Twilio

Similar steps as above - both providers can coexist.

## Getting Help

If you encounter issues:

1. **Check logs:** Run with `--verbose` flag
2. **Verify credentials:** Ensure API ID/Hash are correct
3. **Test login:** Try `warelay login --provider telegram` manually
4. **Check session:** Verify `~/.warelay/telegram/session/` exists and is readable
5. **Review config:** Ensure `~/.warelay/warelay.json` is valid JSON5

For bugs or feature requests, file an issue on GitHub.
