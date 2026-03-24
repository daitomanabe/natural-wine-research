# NATURAL WINE DATA VISUALIZATION
## プロジェクトビジョン + ローカルセットアップ

---

## このプロジェクトで目指すこと

### コアコンセプト

ナチュールワインは「介入しないこと」を哲学とする。  
データビジュアライゼーションは「見えないものを見えるようにする」行為だ。

この二つは矛盾していない。  
農業 × 醸造 × 流通 × 消費という複雑な情報の連鎖を、  
**ナチュールワインの価値観そのもの**で可視化する——  
透明性、産地との繋がり、人の手の痕跡。

---

### フェーズ別ロードマップ

#### Phase 1 — データ基盤（現在地）
- 40ワイン / 11カ国のシードデータ
- SO₂量 × 介入度スコアの散布図
- フィルタリング + テーブルビュー
- ワインカラー × 農法 × 価格の多軸表現

**目標:** データモデルを固める。何を「測る」べきかを定義する。

---

#### Phase 2 — データ収集の自動化
- **ワインスクレイパー:** Vivino / Wine-Searcher / 生産者サイトからの自動取得
- **自然言語パーサー:** テイスティングノートからフレーバータグを自動抽出（Claude API）
- **日本市場レイヤー:** 国内インポーター情報 + 取扱店舗 + 入荷情報
- **ヴィンテージ気象データ:** 産地の気温・降雨量 → ワイン品質との相関分析

**目標:** データを「集める」仕組みを作る。静的DBから動的DBへ。

---

#### Phase 3 — 深い可視化レイヤー
- **地図ビュー:** 産地ごとのSO₂分布 / 農法マップ（Mapbox or D3 geo）
- **時系列ビュー:** ヴィンテージ変化 — 気候変動とナチュールワインの相関
- **品種ネットワーク:** ブドウ品種の交配関係 + 地域分布をグラフで
- **生産者プロフィール:** ワイナリーごとのフィロソフィー × データの対話
- **テイスティングノートの意味空間:** embedding でフレーバーをクラスタリング

**目標:** 「探索する喜び」を設計する。Google Maps of Natural Wine。

---

#### Phase 4 — インタラクティブ体験 / インスタレーション応用
- **ラベルスキャン → 即時データ表示:** カメラ入力 + YOLO / OCR
- **ソムリエAI:** 「今夜の料理に合うゼロゼロの白を3本」→ DB検索 + 推薦
- **物理インスタレーション:** ワインボトルをセンサーで認識 → プロジェクションマッピング
- **パフォーマンス応用:** SO₂量を音のパラメータに変換 → サウンドスケープ生成

**目標:** データが「体験」になる瞬間を作る。

---

### 測定したい核心的な問い

```
1. SO₂量とテイスティングノートの間に統計的な相関はあるか？
   （「ファンク」「ナチュラル」はSO₂ゼロのワインに偏るか）

2. 気候変動は介入度スコアを押し上げているか？
   （暑い年 → 補糖不要だが腐敗リスク上昇 → SO₂増加）

3. 価格と「naturalness」に相関はあるか？
   （希少性 vs 哲学 — どちらが価格を決めているか）

4. 日本市場でのナチュールワインの流通経路と価格マークアップ

5. 農法認証（Demeter / AB）はSO₂量の「保証」になっているか？
```

---

### デザイン哲学

- **UI自体がナチュールワインのラベルのように:** 手仕事感 / 情報の密度 / 余白
- **数字は「正確」より「誠実」に:** 推定値・欠損値・不確かさを隠さない
- **日英バイリンガル:** 日本のナチュールワインコミュニティへの入口として
- **FIL Design System準拠:** ダークブルータリスト / IBM Plex Mono

---

## ローカルセットアップ

```bash
# 1. プロジェクト作成
npx create-react-app naturalwine-viz
cd naturalwine-viz

# または Vite（推奨）
npm create vite@latest naturalwine-viz -- --template react
cd naturalwine-viz
npm install

# 2. JSXファイルを配置
# naturalwine-viz.jsx → src/App.jsx に置き換え

# 3. 起動
npm run dev
# → http://localhost:5173

# 4. データファイルを配置（任意）
cp naturalwine-db.json public/
```

### 推奨追加パッケージ

```bash
# 地図
npm install mapbox-gl react-map-gl

# データ処理
npm install d3 lodash

# アニメーション
npm install framer-motion

# データベース（ローカル）
npm install lowdb   # JSON-based lightweight DB

# スクレイピング（別プロセス / Node.js）
npm install puppeteer cheerio axios

# 埋め込みベクトル / クラスタリング
npm install @anthropic-ai/sdk  # Claude API for flavor tag extraction
```

### ディレクトリ構成（推奨）

```
naturalwine-viz/
├── src/
│   ├── App.jsx              # メインビジュアライゼーション
│   ├── components/
│   │   ├── ScatterPlot.jsx
│   │   ├── RadarMini.jsx
│   │   ├── WineDetail.jsx
│   │   ├── MapView.jsx      # (Phase 3)
│   │   └── Timeline.jsx     # (Phase 3)
│   ├── data/
│   │   └── wines.json       # シードDB（随時拡張）
│   ├── hooks/
│   │   └── useWineFilter.js
│   └── lib/
│       └── naturalness.js   # naturalness スコア計算ロジック
├── scripts/
│   ├── scraper.js           # (Phase 2) データ収集
│   └── extract-flavors.js   # (Phase 2) Claude API でタグ抽出
└── public/
    └── naturalwine-db.json
```

---

## Naturalness スコア計算式（現行 v0.1）

```js
// 0〜10 点、10 = 完全にナチュール
function naturalness(wine) {
  let score = 10;
  score -= wine.intervention * 2;          // 介入度ペナルティ
  score -= wine.so2 / 9;                   // SO₂ペナルティ（45mg/L → -5点）
  if (!wine.indigenousYeast) score -= 1;
  if (wine.filtration === "filtered") score -= 1;
  if (wine.filtration === "light")    score -= 0.5;
  if (wine.addedSo2) score -= 0.5;
  return Math.max(0, Math.min(10, score));
}
```

このスコアリング自体が「議論の対象」であるべき。  
ナチュールワインの定義は今も流動的で、コミュニティで争われている。  
**スコアは答えではなく、対話のきっかけ。**

---

*v0.1 — 2026.03*  
*Daito Manabe Studio*
