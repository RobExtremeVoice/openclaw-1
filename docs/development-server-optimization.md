# ClawdBot開発用サーバー最適化計画

## サーバー情報
- **Guild ID**: 1459626872660033607
- **Bot Account**: PPAL Bot
- **設定ステータス**: 有効

## 現在のエージェント配分

| Agent | チャンネル数 | 担当 |
|-------|------------|------|
| main | 1 | デフォルト |
| しきるん | 22 | コーディネーター |
| まなぶん | 6 | カリキュラム |
| ささえるん | 15 | サポート |
| ひろめるん | 3 | マーケティング |
| つくるん | 0 | コンテンツ生成 |
| かぞえるん | 0 | 分析・レポート |

## 推奨カテゴリ構造

### 🎯 Conductor Category (しきるん)
- `#general` - 全体調整
- `#announcements` - お知らせ
- `#task-assignments` - タスク割り当て
- `#coordination` - 連携調整

### 📚 Curriculum Category (まなぶん)
- `#curriculum-planning` - カリキュラム設計
- `#lesson-review` - レッスンレビュー
- `#learning-materials` - 学習教材
- `#student-feedback` - 受講生フィードバック
- `#course-updates` - コース更新
- `#qa-curriculum` - カリキュラムQ&A

### 🛠️ Content Creation Category (つくるん) - **新規追加**
- `#content-generation` - コンテンツ生成
- `#slide-creation` - スライド作成
- `#script-writing` - スクリプト作成
- `#media-production` - メディア制作
- `#content-review` - コンテンツレビュー
- `#template-library` - テンプレートライブラリ

### 📢 Marketing Category (ひろめるん)
- `#promotion-strategy` - プロモーション戦略
- `#social-media` - ソーシャルメディア
- `#content-distribution` - コンテンツ配信
- `#campaign-tracking` - キャンペーン追跡

### 🛡️ Support Category (ささえるん)
- `#student-support` - 受講生サポート
- `#technical-help` - テクニカルヘルプ
- `#faq-management` - FAQ管理
- `#issue-tracking` - 課題追跡
- `#troubleshooting` - トラブルシューティング
- `#support-analytics` - サポート分析
- `#knowledge-base` - ナレッジベース
- `#training-resources` - トレーニングリソース

### 📊 Analytics Category (かぞえるん) - **新規追加**
- `#performance-metrics` - パフォーマンス指標
- `#engagement-data` - エンゲージメントデータ
- `#sales-reports` - 売上レポート
- `#kpi-dashboard` - KPIダッシュボード
- `#trend-analysis` - トレンド分析
- `#report-automation` - レポート自動化

## 新規チャンネル作成手順

1. Discordでカテゴリ・チャンネルを作成
2. チャンネルIDを取得（開発者モード有効化）
3. `~/.clawdbot/clawdbot.json` にバインディング追加
4. ClawdBotを再起動

## バインディング追加例

```json
{
  "agentId": "tsukurun",
  "match": {
    "channel": "discord",
    "accountId": "ppal",
    "peer": { "kind": "channel", "id": "NEW_CHANNEL_ID" }
  }
}
```

## 次のステップ

1. ✅ Phase 1: Discordサーバー構築（完了）
2. ✅ Phase 2: ClawdBotインストール（完了）
3. 🔄 Phase 3: チャンネル最適化（進行中）
   - [ ] つくるん用チャンネル追加
   - [ ] かぞえるん用チャンネル追加
   - [ ] バインディング設定更新
   - [ ] 動作テスト
4. ⏳ Phase 4: 権限設定
5. ⏳ Phase 5: テスト・検証
