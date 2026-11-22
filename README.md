# GOKURAKU 極楽 公式サイト

静的サイト（フレームワークなし・依存パッケージなし）。`node tools/build.mjs` で `dist/` に出力し、Vercel がそのまま配信します（設定は `vercel.json` に記載済み）。

## フォルダ構成

| パス | 内容 |
|---|---|
| `src/index.html` | ページのテンプレート（`{{キー}}` が各言語の文言に置き換わる） |
| `src/app.css` / `src/app.js` | デザインと動作（パネル、検索、言語切替、キャンペーン表示など） |
| `content/i18n/{ja,en,th}.json` | 文言。日本語が基準。キーが欠けているとビルドが止まります |
| `content/products.json` | お品書き（品種・価格） |
| `content/quality-steps.json` | 品質管理の工程。`confirmed: true` の工程だけ公開 |
| `content/campaigns.json` | キャンペーン（スキーマ：`content/campaigns.schema.json`） |
| `brand/source/` | 公式ロゴの元データ（オーナー支給） |
| `public/` | 生成済みの画像・ロゴ・アイコン（そのまま配信） |
| `media/` | 元の写真・動画 |
| `tools/build_assets.py` | 画像の AVIF/WebP 化、ロゴの透過化、ファビコン・PWAアイコン生成 |
| `tools/build.mjs` | `dist/` へのビルド（ja → `/`、en → `/en/`、th → `/th/`） |

## よく使う作業

```bash
node tools/build.mjs                 # ビルド
python3 -m http.server 8080 -d dist  # ローカル確認 http://localhost:8080
python3 tools/build_assets.py        # 画像・ロゴを更新したとき（Pillow 11 以上）
```

- **価格・品種を変える**：`content/products.json` を編集。
- **文言を変える**：`content/i18n/ja.json` と同じキーを `en.json` / `th.json` でも更新。
- **品質管理の工程を追加**：実施内容を確認したうえで `content/i18n/*.json` の `c.<id>.d` に説明を入れ、`content/quality-steps.json` の該当工程を `confirmed: true` に（写真があれば `photo` に名前を指定）。
- **ロゴを差し替える**：`brand/source/` の公式ファイルを置き換えて `python3 tools/build_assets.py`。ヘッダー・フッター・ファビコン・PWAアイコンがすべて同じ元データから再生成されます。

## キャンペーンの公開ルール

`content/campaigns.json` のキャンペーンがサイトに出るのは、次の **すべて** を満たすときだけです。条件を満たさないものはビルド時に除外され、公開サイトのファイルにも含まれません。

1. `status` が `published`
2. `legal.status` が `approved`（法令確認済み）
3. 終了日時を過ぎていない（ブラウザ側でも開始・終了日時と地域 `TH` を再確認）

大麻製品の購入特典・値引き・無償提供を含む施策は `involves_cannabis_incentive: true` とし、対象地域の法律と広告・販売規制の確認が終わるまで `legal.status` を `approved` にしないでください。
