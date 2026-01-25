# Clawdbot Bot ID 分析レポート

## 現状分析

### 現在のBot設定
- **Bot名**: PPAL Bot
- **Client ID**: 1459727543400665275
- **Token**: [REDACTED] - セキュリティのため削除

### 参加サーバー
1. **シュンスケ式Workflow** (1260121338811514880) - 開発用
2. **PPAL ~Pro Prompt Agent Lab~** (1459626872660033607) - 本番用

---

## 問題点

### 1. エージェント定義の競合
```
同一のBot設定で、異なるエージェントセットを使用しようとしている:

PPALサーバー用: まなぶん、つくるん、ひろめるん、ささえるん、かぞえるん
開発サーバー用: カエデ、サクラ、ツバキ、ボタン、ながれるん
```

### 2. 設定の共有
- 同じ `~/.clawdbot/clawdbot.json` を使用
- agents.list にPPALエージェントのみ定義済み
- Miyabi Coreエージェントが未定義

### 3. Bot Tokenの状態
- APIリクエストがエラー → Tokenが無効の可能性

---

## 推奨: 新しいBot IDを作成

### ✅ メリット

| 項目 | 説明 |
|------|------|
| **完全分離** | PPAL用と開発用で設定ファイルを分離可能 |
| **エージェント競合解消** | それぞれのサーバー専用エージェント定義 |
| **安全性向上** | 開発用の実験が本番環境に影響しない |
| **管理容易** | 問題発生時に影響範囲が限定される |

### 📋 設定構成

#### PPAL Bot (本番用)
```json
{
  "name": "PPAL Bot",
  "config": "~/.clawdbot/clawdbot.json",
  "agents": ["shikirun", "manabun", "tsukurun", "hiromerun", "sasaerun", "kazoerun"],
  "servers": ["PPAL ~Pro Prompt Agent Lab~"]
}
```

#### Miyabi Dev Bot (開発用)
```json
{
  "name": "Miyabi Dev Bot",
  "config": "~/.clawdbot-dev/clawdbot.json",
  "agents": ["main", "kaede", "sakura", "tsubaki", "botan", "nagarerun"],
  "servers": ["シュンスケ式Workflow"]
}
```

---

## 新規Bot作成手順

### Step 1: Discord Developer Portal
1. https://discord.com/developers/applications にアクセス
2. "New Application" → "Miyabi Dev Bot" を作成
3. Client ID をメモ

### Step 2: Bot作成
1. "Bot" タブ → "Add Bot"
2. Bot Token をコピーして安全に保存

### Step 3: 権限設定
必要な権限:
- Manage Channels (チャンネル管理)
- Manage Webhooks (Webhook管理)
- Send Messages (メッセージ送信)
- Manage Messages (メッセージ管理)
- Read Message History (メッセージ履歴)

招待URL生成:
```
https://discord.com/oauth2/authorize?client_id={NEW_CLIENT_ID}&permissions=268445712&scope=bot%20applications.commands
```

### Step 4: 開発用設定ファイル作成
```bash
# 新しい設定ディレクトリ
mkdir -p ~/.clawdbot-dev

# 設定ファイル作成（Miyabi Coreエージェント定義済み）
```

### Step 5: Clawdbot起動
```bash
# PPAL Bot (既存)
CLAWDBOT_CONFIG=~/.clawdbot/clawdbot.json pnpm clawdbot start

# Miyabi Dev Bot (新規)
CLAWDBOT_CONFIG=~/.clawdbot-dev/clawdbot.json pnpm clawdbot start
```

---

## 結論

**新しいBot IDを作成することを強く推奨します。**

理由:
1. 現在のTokenが無効の可能性
2. エージェント定義の競合問題を解消
3. 本番環境と開発環境の完全分離
4. 将来の拡張性（複数の開発環境）

---

## 次のアクション

新しいBot IDを作成しますか？

1. ✅ **はい** - 新しいBot作成をサポートします
2. ❌ **いいえ** - 既存Botで設定修正を試みます
