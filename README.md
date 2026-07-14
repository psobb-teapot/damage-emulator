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
- **全123武器** (ATP範囲・ATA・最大グラインド・Hit%/属性上限・特殊・段ごとのヒット数)
- **全135敵** (Ultimate 全エリア: Ep1/Ep2/Ep4、種族・全耐性・ボスフラグ付き)
- **フレーム8種 / バリア10種** (ATP/ATA 補正) + ユニット等の追加値入力
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
クラス・武器・敵・バフをフォームで設定すると即時に再計算され、
敵HPバー上に各ヒットの期待ダメージ（色=攻撃タイプ、濃さ=命中率）、
キル確率、ヒットごとのダメージ表が表示されます。

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

すべて [wiki.pioneer2.net](https://wiki.pioneer2.net/w/Game_mechanics) 準拠 (Ephinea 値):

| 項目 | 式 |
|---|---|
| ダメージ | `⌊(ATPeff − DFPeff) / 5 × 0.9 × 攻撃修正⌋` |
| 攻撃修正 | Normal 1.0 / Hard 1.89 / Special 0.56 / Charge・Spirit・Berserk 3.33 / Vjaya 5.67 |
| 実効ATP | `[BaseATP + Wvar×WSpread] × (1 + シフタ%) + EQATP + Pvar` |
| 装備ATP | `[武器ATPmin + グラインド×2 + 防具ATP] × (1 + 属性%)` |
| 実効DFP | `DFP × (1 − ザルア%)` |
| 命中率 | `ATA合計 × タイプ修正 × コンボ段修正 − EVPeff × 0.2 − 距離ペナルティ` |
| タイプ修正 | Normal 1.0 / Hard 0.7 / Special 0.5 (例外武器は 0.7) |
| コンボ段修正 | 1段目 1.0 / 2段目 1.3 / 3段目 1.69 |
| 実効EVP | `EVP × 状態異常修正 (麻痺 0.85 / 凍結 0.7 / 両方 0.55) × (1 − ザルア%)` |
| 距離ペナルティ | `距離 × 0.33` (HU/FO の射撃、Smartlink 無し時のみ) |
| シフタ/ザルア | `1.3 × (Lv − 1) + 10` % (Lv1-30) |
| クリティカル | 発生率 `min(LCK,100)/5` %、ダメージ ×1.5 |
| 特殊発動率 | `(Power − 敵EDK/ESP) × 特殊効果係数 × ユニット倍率` (V501/V502 で ×1.5、即死系は V502 で ×2。凍結はキャップ 40%) |

## データについて

武器・敵・防具のデータは [psostats.com/combo-calculator](https://psostats.com/combo-calculator)
に埋め込まれたデータのスナップショット (`data/raw/*.json`) から生成しています
(元データは Ephinea PSOBB / wiki.pioneer2.net 由来)。

- 敵データは **Ultimate 難易度・マルチプレイ時**の値。他難易度は `Enemy` 型で自由に定義可能。
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
├── combo.ts        # コンボシミュレーション (キル確率の分布計算)
├── ui/             # ブラウザUI (Vite + vanilla TS)
└── data/
    ├── classes.ts     # 全12クラスの Lv200 / 最大ステータス
    ├── specials.ts    # 特殊攻撃の定義テーブル (固有特殊含む)
    ├── weapons.gen.ts # 全123武器 (自動生成)
    ├── enemies.gen.ts # 全135敵 (自動生成)
    └── armor.gen.ts   # フレーム/バリア (自動生成)

data/raw/           # psostats 由来の生データ (スナップショット)
tools/generate-data.mjs  # 生データ → src/data/*.gen.ts の生成
```
