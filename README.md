# GOKURAKU 極楽 公式サイト

静的サイト（フレームワークなし・依存パッケージなし）。`node tools/build.mjs` で `dist/` に出力し、Vercel がそのまま配信します（設定は `vercel.json` に記載済み）。

## フォルダ構成

| パス | 内容 |
|---|---|
| `src/layout.html` | 全ページ共通の枠（ヘッダー・ドロワーメニュー・下部ナビ・フッター・年齢確認） |
| `src/pages/home.html` | トップ（HERO / 3つの理念 / Living Soil / 職人の仕事 / お品書き / お問い合わせ・FAQ） |
| `src/pages/living-soil.html` | Living Soil 詳細（説明・4ステップの図解・栽培ルームの映像） |
| `src/pages/quality.html` | 品質（職人の仕事・品質管理4ステップ・栽培方針と根拠の表） |
| `src/app.css` / `src/fonts.css` / `src/app.js` | デザイン、フォント（Inter をサイト内に配置）、動作 |
| `content/i18n/*.json` | 文言（10言語）。日本語 `ja.json` が基準。キーが欠けているとビルドが止まります |
| `content/products.json` | お品書き（品種・価格） |
| `content/quality-steps.json` | 品質管理の4ステップと写真の割り当て（`photo: null` は「写真準備中」表示） |
| `content/claims.json` | 品質に関する表示と根拠の確認状況（`hidden` は表示しない） |
| `content/campaigns.json` | キャンペーン（スキーマ：`content/campaigns.schema.json`） |
| `brand/source/` | 公式ロゴの元データ（オーナー支給） |
| `public/` | 生成済みの画像・ロゴ・アイコン・フォント（そのまま配信） |
| `media/` | 元の写真・動画 |
| `tools/build_assets.py` | 画像の AVIF/WebP 化、ロゴの透過化、ファビコン・PWAアイコン生成 |
| `tools/build.mjs` | `dist/` へのビルド（3ページ × 10言語。ja → `/`、他 → `/{言語}/`） |
| `tools/check.mjs` | ビルド結果の検査（リンク切れ・重複ID・alt・翻訳キー） |
| `tools/smoke.cjs` | ブラウザでの動作確認（Playwright が入っている環境で実行） |

URL：`/`、`/living-soil/`、`/quality/`（英語は `/en/`、`/en/living-soil/`… 以下同様。言語は ja / en / th / zh / ko / es / pt / ru / vi / my）

## よく使う作業

```bash
npm run check                        # ビルド + 検査
npm run preview                      # ローカル確認 http://localhost:8080
SITE=http://localhost:8080 node tools/smoke.cjs   # 動作確認（別ターミナルで）
python3 tools/build_assets.py        # 画像・ロゴを更新したとき（Pillow 11 以上）
```

- **価格・品種を変える**：`content/products.json` を編集。
- **文言を変える**：`content/i18n/ja.json` と同じキーを他の9言語でも更新。
- **品質工程の写真を差し替える**：写真を `media/images/` に置き、`tools/build_assets.py` に追加して生成し、`content/quality-steps.json` の `photo` に名前を指定。
- **根拠が確認できた表示を更新する**：`content/claims.json` の `status` を `verified` にし、`evidence` が指す文言（`ev.*`）を書類の内容に合わせて更新。「100% ORGANIC」などの `hidden` は、根拠とタイの表示規制の確認が済むまで公開しないでください。
- **ロゴを差し替える**：`brand/source/` の公式ファイルを置き換えて `python3 tools/build_assets.py`。ヘッダー・フッター・ファビコン・PWAアイコンがすべて同じ元データから再生成されます。

## キャンペーンの公開ルール

`content/campaigns.json` のキャンペーンがサイトに出るのは、次の **すべて** を満たすときだけです。条件を満たさないものはビルド時に除外され、公開サイトのファイルにも含まれません。

1. `status` が `published`
2. `legal.status` が `approved`（法令確認済み）
3. 終了日時を過ぎていない（ブラウザ側でも開始・終了日時と地域 `TH` を再確認）

大麻製品の購入特典・値引き・無償提供を含む施策は `involves_cannabis_incentive: true` とし、対象地域の法律と広告・販売規制の確認が終わるまで `legal.status` を `approved` にしないでください。
