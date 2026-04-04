# VIN NATUREL OS

自然派ワインのレストラン運用向けOSです。  
ワインラベル写真をOCRで読み取り、在庫として登録し、在庫データとグローバルカタログを統合した状態で推薦を返します。

このリポジトリには、実運用に必要な以下の3点をまとめています。

- カタログ/在庫/ラベルのデータ基盤（`server/data/*`, `database-bundle/*`）
- ワイン管理と推薦を行うWebUI（`src/App.jsx`）
- 運用用マニュアルと運用Webページ（`public/ops-site/index.html`）

---

## 1. ローカル起動

### 必要環境

- Node.js 20 以上
- Azure OCR（任意）: `AZURE_ENDPOINT` / `AZURE_KEY` を設定すると高精度OCRを利用

```bash
npm install
```

### 起動

```bash
npm run dev:full
```

### よく使う起動コマンド

- Web だけ起動: `npm run web`
- API だけ起動: `npm run dev:server`
- Web/Server 同時起動: `npm run start:all`（`npm run dev:full` のエイリアス）
- Webを外部公開向けで起動: `npm run start:web`
- 本番向け静的配信: `npm run build && npm run preview`

- フロントエンド: http://127.0.0.1:5173
- API: http://127.0.0.1:8787
- 運用Webサイト（実運用入口）: http://127.0.0.1:5173/ops-site/

### 本番ビルド

```bash
npm run build
npm run preview
```

---

## 2. 運用Webサイト

`public/ops-site/index.html` は店頭運用を想定した

- 在庫状況の簡易監視
- ライブ文脈（天気/ニュース/曲）保存の入口
- おすすめAPIの生データ確認
- アプリ画面と運用マニュアルへの入口

をまとめた、非ログイン運用ページです。  
iPad固定運用時には、ブラウザでこのページを開いておき、メインの在庫登録・推薦画面はボタンリンクから遷移できます。

---

## 3. データフロー

1. **基盤統合**
   - 初期カタログ: `src/data/wines.js`
   - 追加カタログ: `server/data/catalog-additions.json`
   - 画像ラベルメタ: `server/data/labels.json`
   - 在庫: `server/data/inventory.json`
   - ライブ文脈: `server/data/live-context.json`

2. **OCR -> 一致 -> 在庫登録**
   - `/api/analyze/upload` で画像を読み取り
   - `/api/recommend` 系APIはワイン一致結果を返却
   - `/api/inventory` または `/api/inventory/import` で在庫化

3. **推薦**
   - 手動入力推薦: `/api/recommend/manual`
   - 自動文脈推薦: `/api/recommend/context`
   - DJ/ニュース/天気連動推薦: `/api/recommend/live`

4. **再配布用データ束**
   - `npm run bundle:export` で `database-bundle` を最新化
   - 主要ファイル:
     - `database-bundle/catalog-unified.json`
     - `database-bundle/inventory-materialized.json`
     - `database-bundle/inventory-summary.json`
     - `database-bundle/catalog-stats.json`
     - `database-bundle/live-context.json`
     - `database-bundle/OVERVIEW.json`

---

## 4. 実運用の基本手順

### A. ラベル登録（新規在庫）

1. 「CELLAR OPERATIONS」画面で画像をアップロード  
2. OCR結果から最適ワインを選択または新規登録  
3. 保管場所/数量を入力して保存  
4. 必要なら `BULK INVENTORY IMPORT` でCSV/JSON一括登録

### B. iPad向け自動推薦

1. `LIVE` 入力欄を入力（`track info`, 天気/トレンドメモなど）
2. 「Save Live Context」
3. 「Run Live Recommendation」
4. 画面の `Catalog Picks` / `Cellar Inventory Picks` をそのまま提示

### C. データ保全

1. `database-bundle` を定期エクスポート
2. `OVERVIEW.json` を保全ログとして保管
3. `.gitignore` 対象の `server/data/*.json` はローカル再生成を前提

### D. ネット収集ソース（source-watchlist）

- SampleAPIs: `reds` / `whites` / `rose` / `sparkling`
- X-Wines: テストCSV（100本）
- Open Food Facts: ワイン候補クエリ（`wine`, `organic wine`, `vegan wine`, `champagne` など）
- 追加済み: Open Food Facts（natural red / natural white / natural rosé / organic / orange / natural sparkling / biodynamic / vegan / champagne / petit verdot / low intervention）
- 追加済み: SampleAPIs (`dessert`, `port`)
- 追加済み: Open Food Facts ページャブル収集（`wine` 2-4ページ、`organic wine`/`vegan wine`/`champagne` 2ページ）
- 追加済み: Gistベース酒データベース（`Ajubin Wine Reviews`, `Mconnor Wines`）
- Wine Enthusiast レビュー集（TidyTuesday）

```bash
npm run collect:sources          # 有効化済みソースを一括収集
npm run collect:sources -- --force # 無効化を含めて実行
npm run collect:sources sampleapi-reds # 単一ソースを実行
```

収集先は `server/data/source-watchlist.json` で一元管理しています。  
`catalog-additions.json` と `database-bundle/*` を再生成して本体へ反映します。

---

## 5. 主要コマンド

```bash
npm run dev:full        # サーバー + フロント同時起動
npm run dev:server      # サーバーのみ
npm run dev:client      # フロントのみ
npm run web             # フロントだけ起動（別名: npm run dev）
npm run start:web       # フロント起動（デフォルト: 0.0.0.0:5173）
npm run start:all       # サーバー + フロント同時起動
npm run bundle:export   # 統合バンドルの再生成
npm run collect:sources  # ソース取り込み（設定済みのソース）
npm run import:catalog  # 外部CSV/JSONからカタログ追加
npm run import:labels   # 外部JSONからラベル追加
```

---

## 6. 運用サイト（マニュアル）

`/ops-site/`（静的ページ）と、`README` 内のコマンド・運用手順を合わせて使ってください。  
このリポジトリは `main` ブランチで進行中の運用用サイトを公開前提で構成しています。
