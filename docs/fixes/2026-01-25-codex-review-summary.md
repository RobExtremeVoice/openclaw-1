# CodeXレビュー依頼: Clawdbot Config Reload Loop Fix

## 📋 レビュー依頼内容

**概要**: Clawdbotの並列実行時におけるサービス再起動ループの修正

**関連Issue**: #93 (Fix実装), #92 (調査レポート)

---

## 🔧 変更サマリー

### ファイル: `src/gateway/config-reload.ts`

#### 変更1: metaフィールド無視ルール追加 (line 67)

```diff
 const BASE_RELOAD_RULES_TAIL: ReloadRule[] = [
   { prefix: "identity", kind: "none" },
   { prefix: "wizard", kind: "none" },
   { prefix: "logging", kind: "none" },
+  { prefix: "meta", kind: "none" },  // FIX: meta.*フィールドの変更を無視
   { prefix: "models", kind: "none" },
```

**目的**: `meta.lastTouchedAt`, `meta.lastTouchedVersion` の変更による再起動ループを防止

#### 変更2: デバウンス時間延長 (line 43)

```diff
 const DEFAULT_RELOAD_SETTINGS: GatewayReloadSettings = {
   mode: "hybrid",
-  debounceMs: 300,
+  debounceMs: 5000,  // FIX: 300ms → 5000ms
 };
```

**目的**: 並列実行時の複数Config更新を集約

---

## 🎯 レビュー観点

### 1. 正確性 (Accuracy)

**質問**: metaフィールドの変更が正しく無視されるか?

**確認事項**:
- [ ] `meta.*` パスが `kind: "none"` でマッチされる
- [ ] `diffConfigPaths()` でmetaフィールドが検出されても無視される
- [ ] `buildGatewayReloadPlan()` でmetaが `noopPaths` に追加される

### 2. 完全性 (Completeness)

**質問**: 他のフィールドへの副作用はないか?

**確認事項**:
- [ ] 既存のhot reloadアクションは正しく動作
- [ ] その他の `"none"` ルールに影響なし
- [ ] `"restart"` ルールの評価順序に問題なし

### 3. 安全性 (Safety)

**質問**: デバウンス延長による問題はないか?

**確認事項**:
- [ ] 5000msの遅延がクリティカルな操作に影響しない
- [ ] ユーザー設定 (`gateway.reload.debounceMs`) で上書き可能
- [ ] 長時間のデバウンスでConfig変更が失われない

### 4. パフォーマンス (Performance)

**質問**: 5000msの遅延がUXに影響しないか?

**確認事項**:
- [ ] 通常のConfig更新は5秒以内に反映される
- [ ] 並列実行時の複数更新が正しく集約される
- [ ] 再起動回数が大幅に削減される (30回 → <5回/時間)

---

## 🧪 テストケース

### 追加テスト推奨

```typescript
describe("Config Reload - meta field ignore", () => {
  it("should ignore meta.lastTouchedAt changes", () => {
    const prev = { meta: { lastTouchedAt: "2026-01-25T10:00:00Z" } };
    const next = { meta: { lastTouchedAt: "2026-01-25T10:05:00Z" } };
    const plan = buildGatewayReloadPlan(diffConfigPaths(prev, next));
    expect(plan.restartGateway).toBe(false);
    expect(plan.noopPaths).toContain("meta.lastTouchedAt");
  });

  it("should ignore meta.lastTouchedVersion changes", () => {
    const prev = { meta: { lastTouchedVersion: "2026.1.23-1" } };
    const next = { meta: { lastTouchedVersion: "2026.1.24-0" } };
    const plan = buildGatewayReloadPlan(diffConfigPaths(prev, next));
    expect(plan.restartGateway).toBe(false);
    expect(plan.noopPaths).toContain("meta.lastTouchedVersion");
  });
});

describe("Config Reload - 5000ms debounce", () => {
  it("should debounce multiple changes within 5000ms", async () => {
    // テスト実装が必要
  });
});
```

---

## 📊 エッジケース

| ケース | 期待動作 | 確認方法 |
|--------|----------|----------|
| meta以外のフィールド変更 | 正常に再起動 | Unit Test |
| 5秒以上の間隔で更新 | デバウンス効かず | Unit Test |
| hot reloadアクション | 既存機能正しく動作 | Integration Test |

---

## 🔄 レビューフロー

1. **コードレビュー**: 本内容を確認
2. **フィードバック**: 問題があれば修正
3. **承認**: 問題なければ承認
4. **次フェーズ**: Unit Tests実行

---

**作成者**: しきるん (Claude Code)
**作成日**: 2026-01-25
**ステータス**: 🟡 レビュー待ち
