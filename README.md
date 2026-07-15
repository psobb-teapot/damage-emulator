# pso-damage-emulator

PSOBB (Phantasy Star Online: Blue Burst) のコンボ・ダメージ計算エンジン。
[psostats.com/combo-calculator](https://psostats.com/combo-calculator) 相当の計算を
TypeScript モジュールとして提供します。

計算式の出典: [Ephinea PSO Wiki — Game mechanics](https://wiki.pioneer2.net/w/Game_mechanics) /
[Special attacks](https://wiki.pioneer2.net/w/Special_attacks)

## できること

- 3段コンボ (Normal / Hard / Special の任意の組み合わせ) の各ヒットの **ダメージ幅 (min/avg/max)** と **命中率** の算出
- **特殊攻撃**の発動率・効果 (Hell 即死、Demon's/Devil's 削り、凍結・麻痺・混乱、HP/TP吸収、EXP奪取、Charge/Spirit/Berserk/Vjaya)
- シフタ / ザルア、凍結・麻痺による敵 EVP 低下、V501/V502、Smartlink・距離ペナルティ
- クリティカル (LCK 依存) を織り込んだ期待ダメージ
- 命中・クリティカル・特殊発動を確率分布として畳み込んだ **キル確率** と **期待残りHP**
- **全123武器** (ATP範囲・ATA・最大グラインド・Hit%/属性上限・特殊・段ごとのヒット数・射程)
- **全135敵** (Ultimate 全エリア: Ep1/Ep2/Ep4、種族・全耐性・ボスフラグ付き)。
  **マルチプレイ / 一人用モード**の両ステータスを収録 (`ENEMIES` / `ENEMIES_ONE_PERSON`)
- **フレーム8種 / バリア10種** (ATP/ATA 補正) + ユニット等の追加値入力
- **セット効果** (Thirteen+Diska of Braveman、Crimson Coat+Red系、Samurai Armor+Orotiagito、
  Sweetheart、Safety Heart+Rambling May、POSS ユニット、Commander Blade)
- **SNグリッチ** (2段目の命中率で1段目を置換)
- **命中率レンジ** (武器の最大射程での距離ペナルティ込み命中率)
- **コンボ所要フレーム数** (男女・クラス固有アニメーション対応の攻撃速度)
- **オートコンボ** (命中100%優先 → 非撃破なら最大ダメージ / 撃破可能なら最小フレームで自動探索)
- 全12クラスの Lv200 / 最大ステータスプリセット

## 使い方

```bash
npm install
npm test           # ユニットテスト
npm run demo       # CLI デモ
npm run dev        # ブラウザUI (開発サーバー) → http://localhost:5173
npm run build:web  # ブラウザUIの静的ビルド (dist-web/)
```

### ブラウザUI

`npm run dev` で psostats.com/combo-calculator 相当の計算機UIが起動します。

- **シナリオ選択**: クラス・武器・敵を「セレクタ + 要約 + 詳細折りたたみ」カードで選択。
  要約行にステータス・特殊・種族・コンボ不可などのバッジを表示
- **コンボビルダー**: 武器の制約を反映 (コンボ不可武器は2段目以降が無効、
  特殊なし武器は S ボタンが無効、Dark Flow は特殊時のみ5ヒット)。
  最適コンボ探索・所要フレーム表示付き
- **バフ・装備**: 折りたたみパネル + 有効な設定をチップ表示 (シフタ30・V501 等)。
  セット効果の発動を明示
- **結果**: 計算根拠 (ATA合計・実効ATP・実効DFP)、敵HPバーへの期待ダメージ積み上げ
  (色=攻撃タイプ、濃さ=命中率)、キル確率、ヒット表 (距離ペナルティ対象時は命中率レンジ)
- **URL共有**: 全設定が URL に同期され、「設定を共有」でコピー。リンクを開くと状態を完全復元

```ts
import { simulateCombo, playerFromClass, WEAPONS, ENEMIES } from "pso-damage-emulator";

const result = simulateCombo({
  player: playerFromClass("HUcast", { useMaxStats: true, lck: 100 }),
  weapon: WEAPONS["Excalibur"],           // 独自の Weapon オブジェクトも可
  enemy: ENEMIES["Bartle (Ultimate)"],    // 独自の Enemy オブジェクトも可
  attacks: [{ type: "hard" }, { type: "hard" }, { type: "special" }],
  context: { shiftaLevel: 30, zalureLevel: 30, v501: true },
});

result.hits;             // 各ヒットの命中率・ダメージ・特殊発動率
result.totals.expected;  // 期待合計ダメージ
result.killProbability;  // このコンボで倒せる確率 (0-1)
```

武器・敵は型に沿って自由に定義できます:

```ts
import { makeWeapon, simulateCombo } from "pso-damage-emulator";

const chargeVulcan = makeWeapon({
  name: "Charge Vulcan +9",
  kind: "mechgun",        // メックガンは 1 攻撃 3 ヒット
  atpMin: 25, atpMax: 40, ata: 25, grind: 9,
  attributePercent: 50,   // 対象属性 50%
  special: "Charge",
});
```

## 実装している計算式

[wiki.pioneer2.net](https://wiki.pioneer2.net/w/Game_mechanics) の式に準拠し、
定数は psostats.com の実装と同一 (共通係数 0.9 をダメージ倍率へ折り込み):

| 項目 | 式 |
|---|---|
| ダメージ | `⌊max(0, (ATPeff − DFPeff) / 5) × 攻撃修正⌋` |
| 攻撃修正 | Normal 0.9 / Hard 1.7 / Special 0.5 / Charge・Spirit・Berserk 3.0 / Vjaya 5.1 (wiki 表記の 1.0/1.89/0.56/3.33/5.67 × 0.9 に相当) |
| 実効ATP (min) | `クラスATPmin × (1 + シフタ%) + EQATP` |
| 実効ATP (max) | `クラスATPmax × (1 + シフタ%) + EQATP + WSpread + シフタ% × (WSpread + クラス分散)` |
| クラス分散 | HU 5 / RA 4 / FO 2 (クラスATPmin = ステータス値 − 分散) |
| 装備ATP | `[武器ATPmin + グラインド×2 + 防具ATP] × (1 + 属性%)` (CCA系ミニボスには属性%無効) |
| 実効DFP | `DFP × (1 − ザルア%)` |
| 命中率 | `ATA合計 × タイプ修正 × コンボ段修正 − EVPeff × 0.2 − 距離ペナルティ` (0–100 にクランプ) |
| ATA合計 | `クラスATA + 武器ATA + Hit% + 防具ATA` |
| タイプ修正 | Normal 1.0 / Hard 0.7 / Special 0.5 (Vjaya・Dark Flow・Frozen Shooter は 0.7、TJS は必中) |
| コンボ段修正 | 1段目 1.0 / 2段目 1.3 / 3段目 1.69 |
| 実効EVP | `EVP × 状態異常修正 (麻痺 0.85 / 凍結 0.7 / 両方 0.55)` (ザルアは EVP に影響しない) |
| 距離ペナルティ | `距離 × 0.33` (HU/FO の射撃、Smartlink 無し時のみ) |
| シフタ/ザルア | `1.3 × (Lv − 1) + 10` % (Lv1-30) |
| クリティカル | 発生率 `min(LCK,100)/5` %、ダメージ ×1.5 |
| 特殊発動率 | `(Power − 敵EDK/ESP) × 特殊効果係数 × ユニット倍率` (V501/V502 で ×1.5、即死系は V502 で ×2。凍結はキャップ 40%) |

## psostats.com との一致検証

実際の psostats.com/combo-calculator を Playwright で操作した結果と
本エンジンの出力を突き合わせるパリティテストを収録 (実測日 2026-07-15):

- `test/psostats-parity.test.ts` — 28 パターンの個別検証。
  全12クラス、ダメージ倍率全種 (N/H/犠牲系/Vjaya/Orotiagito/Raikiri/Lavis系/
  Dark Flow/TJS/Frozen Shooter/Mille Marteaux/Arrest)、
  Demon's/Devil's ×(アンドロイド/非アンドロイド)、シフタ/ザルア、
  凍結・麻痺・同時付与、最大ロール、属性%/Hit%/グラインド (ES武器の+250含む)、
  フレーム/バリアATP、CCAミニボス、特殊アニメーション武器
  (Master Raven 3hit / L&K38 5hit / Last Swan 3hit)、TJS必中を網羅。
- `test/psostats-all-enemies.test.ts` — psostats に**全135敵**を表示させた
  結果テーブルとの一括照合 (N/H/S ダメージ・命中率・合計・総合命中率)。
- `test/psostats-features.test.ts` — セット効果6種・POSS/Commander Blade・
  SNグリッチ・命中率レンジ・コンボフレーム数 (男性/女性/クラス固有アニメーション)・
  オートコンボの選択結果 (通常敵 → N/H/S、高EVP敵 → 単発N) の実測照合。

全パターンでダメージ・命中率・合計値が一致する (命中率は psostats の
floor 2桁表示に対し浮動小数点の丸め差 ±0.01 まで許容)。

psostats と意図的に異なる点:
- **Hell 系・状態異常系の発動率**: psostats は発動率を計算しない (本エンジンは wiki の式で算出)
- **HP吸収系 (Gush 等) のダメージ**: psostats は 0 として扱うが、本エンジンは
  実ゲームどおり特殊攻撃ダメージ (0.5x) を与える
- **Demon's/Devil's**: psostats は発動 100% 前提の削り値を表示、本エンジンは発動率 50% を
  期待値・キル確率に織り込む (削り割合・アンドロイド減衰は一致)

## データについて

武器・敵・防具のデータは [psostats.com/combo-calculator](https://psostats.com/combo-calculator)
(一人用モードは [/opm](https://psostats.com/combo-calculator/opm)) に埋め込まれた
データのスナップショット (`data/raw/*.json`) から生成しています
(元データは Ephinea PSOBB / wiki.pioneer2.net 由来)。

- 敵データは **Ultimate 難易度**で、マルチプレイ時と一人用モードの両方を収録。
  他難易度は `Enemy` 型で自由に定義可能。
- 再生成: `node tools/generate-data.mjs` → `src/data/*.gen.ts`
- 武器固有特殊 (Dark Flow / TJS / Orotiagito / Raikiri / Lavis 系 / Mille Marteaux 等) の
  ダメージ倍率は psostats 実装から係数 0.9 の折り込みを外した値
  (例: Dark Flow 1.7 ÷ 0.9 ≒ 1.89)。

## 実装上の仮定 (wiki に明記がない箇所)

- **Devil's / Demon's** は ATP ダメージを与えず、発動時のみ現在HPを削る (発動率 50%)。
  アンドロイド (HUcast/HUcaseal/RAcast/RAcaseal) が Ultimate で使うと 20%/45% に減少
  (psostats 実装準拠)。
- **Hell 系**は不発時に通常の特殊ダメージ (0.56x) を与える。
- **HP吸収** (Draw 系) の吸収量は「Power% × 自分の最大HP」を難易度上限でキャップした値として扱う (TP 吸収は wiki 記載どおり最大TP基準)。
- キル確率の計算では、1ヒットのダメージを平均値に固定した確率分布 (命中/クリティカル/特殊発動の分岐) を用いる。武器ATPの乱数幅による揺らぎは分布に含めない。

## 構成

```
src/
├── types.ts        # 型定義 (Weapon / Enemy / PlayerStats / ComboInput ...)
├── constants.ts    # 攻撃修正値・コンボ修正・キャップなどの定数
├── stats.ts        # 実効 ATP / DFP / EVP / ATA
├── damage.ts       # ダメージ計算
├── accuracy.ts     # 命中率計算
├── special.ts      # 特殊攻撃の発動率・効果
├── combo.ts        # コンボシミュレーション (キル確率の分布計算, SNグリッチ)
├── equipment.ts    # セット効果 / POSS ユニット / Commander Blade
├── frames.ts       # コンボ所要フレーム数 (攻撃速度)
├── autoCombo.ts    # 最適コンボの自動探索
├── ui/             # ブラウザUI (Vite + vanilla TS)
└── data/
    ├── classes.ts       # 全12クラスの Lv200 / 最大ステータス
    ├── specials.ts      # 特殊攻撃の定義テーブル (固有特殊含む)
    ├── weapons.gen.ts   # 全123武器 (自動生成)
    ├── enemies.gen.ts   # 全135敵 (自動生成)
    ├── armor.gen.ts     # フレーム/バリア (自動生成)
    └── animation.gen.ts # アニメーションフレーム表 / POSS対象武器 (自動生成)

data/raw/           # psostats 由来の生データ (スナップショット)
tools/generate-data.mjs  # 生データ → src/data/*.gen.ts の生成
```
